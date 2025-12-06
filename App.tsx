import React, { useState, useEffect, useCallback } from 'react';
import { Note, ViewMode } from './types';
import * as StorageService from './services/storageService';
import * as GeminiService from './services/geminiService';
import Graph from './components/Graph';
import Editor from './components/Editor';
import SettingsModal from './components/SettingsModal';
import { 
  Network, 
  FileText, 
  Plus, 
  Upload, 
  Layout, 
  Sparkles,
  Search,
  Settings,
  X,
  Loader2,
  RefreshCw,
  Edit2,
  Check,
  Trash2
} from 'lucide-react';

const App: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.SPLIT); // Default to split for desktop
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Renaming State
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  // Auto-save states
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [typingTimeout, setTypingTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiResponse, setAiResponse] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsSidebarOpen(true);
      } else {
        setIsSidebarOpen(false);
        // Force single view on mobile
        if (viewMode === ViewMode.SPLIT) setViewMode(ViewMode.EDITOR);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [viewMode]);

  // Function to sync drive
  const syncDrive = useCallback(async () => {
      setIsSyncing(true);
      try {
        const result = await StorageService.fetchNotesFromDrive();
        const driveNotes = (Array.isArray(result) ? result : []) as Note[];
        
        if (driveNotes.length > 0) {
            setNotes(prevNotes => {
                const newNoteMap = new Map(prevNotes.map(n => [n.title, n]));
                let hasChanges = false;

                for (const item of driveNotes) {
                    const dNote = item as Note;
                    const localNote = newNoteMap.get(dNote.title);
                    // Cast to any to safely access properties if type inference fails
                    const remoteLastModified = (dNote as any).lastModified || 0;
                    const localLastModified = localNote ? (localNote.lastModified || 0) : 0;
                    
                    if (!localNote || (remoteLastModified > localLastModified)) {
                        const noteToSave: Note = { 
                            ...dNote, 
                            // Cast to any to safely access id
                            id: localNote ? localNote.id : (dNote as any).id 
                        };
                        newNoteMap.set(dNote.title, noteToSave);
                        StorageService.saveNoteToLocal(noteToSave);
                        hasChanges = true;
                    }
                }
                return hasChanges ? Array.from(newNoteMap.values()) : prevNotes;
            });
        }
      } catch (error) {
        console.error("Sync failed", error);
      }
      setIsSyncing(false);
  }, []);

  // Load notes on mount
  useEffect(() => {
    const loadedNotes = StorageService.getNotesFromLocal();
    setNotes(loadedNotes);
    
    if (loadedNotes.length > 0) {
      if (!activeNoteId) setActiveNoteId(loadedNotes[0].id);
    } else {
        const welcome: Note = {
            id: 'welcome-note',
            title: 'Bem-vindo ao Cognito',
            content: '# Bem-vindo\n\nEste é o seu novo segundo cérebro. Comece criando uma nova nota ou importando seus arquivos Markdown do Obsidian.\n\nUse [[WikiLinks]] para conectar pensamentos.\n\nEste aplicativo sincroniza com o seu Google Drive.\n\nClique no ícone de engrenagem para configurar seu próprio Drive.',
            lastModified: Date.now()
        };
        StorageService.saveNoteToLocal(welcome);
        setNotes([welcome]);
        setActiveNoteId(welcome.id);
    }
    syncDrive();
  }, [syncDrive]); 

  const createNote = async () => {
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: 'Nota Sem Título ' + Math.floor(Math.random() * 1000),
      content: '',
      lastModified: Date.now()
    };
    
    const updatedNotes = [...notes, newNote];
    setNotes(updatedNotes);
    StorageService.saveNoteToLocal(newNote);
    setActiveNoteId(newNote.id);
    
    // Ensure Editor is visible
    if (viewMode === ViewMode.GRAPH) setViewMode(ViewMode.SPLIT);
    
    if (window.innerWidth < 768) setIsSidebarOpen(false);

    setSaveStatus('saving');
    try {
        await StorageService.saveNoteToDrive(newNote);
        setSaveStatus('saved');
    } catch (e) {
        console.error("Failed to create note", e);
        setSaveStatus('unsaved');
    }
  };

  const updateNote = (updatedNote: Note) => {
    const updatedNotes = notes.map(n => n.id === updatedNote.id ? updatedNote : n);
    setNotes(updatedNotes);
    StorageService.saveNoteToLocal(updatedNote);
    setSaveStatus('unsaved');
    
    if (typingTimeout) clearTimeout(typingTimeout);

    const timeout = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await StorageService.saveNoteToDrive(updatedNote);
        setSaveStatus('saved');
      } catch (error) {
        console.error("Auto-save failed", error);
        setSaveStatus('unsaved'); 
      }
    }, 2000);

    setTypingTimeout(timeout);
  };

  const handleDeleteNote = async (noteToDelete: Note) => {
    const updatedNotes = notes.filter(n => n.id !== noteToDelete.id);
    setNotes(updatedNotes);
    StorageService.deleteNoteFromLocal(noteToDelete.id);
    
    if (activeNoteId === noteToDelete.id) {
      setActiveNoteId(updatedNotes.length > 0 ? updatedNotes[0].id : null);
    }

    setSaveStatus('saving');
    try {
      await StorageService.deleteNoteFromDrive(noteToDelete);
      setSaveStatus('saved');
    } catch (error) {
      setSaveStatus('unsaved');
    }
  };

  const handleStartRename = (e: React.MouseEvent, note: Note) => {
    e.stopPropagation();
    setEditingNoteId(note.id);
    setEditTitle(note.title);
  };

  const handleRenameSubmit = async (noteId: string) => {
    const noteToRename = notes.find(n => n.id === noteId);
    if (!noteToRename || !editTitle.trim() || editTitle === noteToRename.title) {
      setEditingNoteId(null);
      return;
    }

    const oldTitle = noteToRename.title;
    const newTitle = editTitle.trim();
    const updatedNote = { ...noteToRename, title: newTitle, lastModified: Date.now() };
    const updatedNotes = notes.map(n => n.id === noteId ? updatedNote : n);
    setNotes(updatedNotes);
    StorageService.saveNoteToLocal(updatedNote);
    
    setEditingNoteId(null);
    setSaveStatus('saving');

    try {
      await StorageService.renameNoteInDrive(oldTitle, newTitle);
      setSaveStatus('saved');
    } catch (error) {
      setSaveStatus('unsaved');
    }
  };

  const handleNavigate = (title: string) => {
      const targetNote = notes.find(n => n.title.toLowerCase() === title.toLowerCase());
      if (targetNote) {
          setActiveNoteId(targetNote.id);
          // If in graph mode, maybe switch to split so user can read content
          if (viewMode === ViewMode.GRAPH) setViewMode(ViewMode.SPLIT);
          
          if (window.innerWidth < 768) setIsSidebarOpen(false);
      } else {
          alert(`Nota "${title}" ainda não existe.`);
      }
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    Array.from(files).forEach((file: File) => {
      if (file.name.endsWith('.md')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          const newNote: Note = {
            id: crypto.randomUUID(),
            title: file.name.replace('.md', ''),
            content: content,
            lastModified: Date.now()
          };
          StorageService.saveNoteToLocal(newNote);
          setNotes(prev => [...prev, newNote]);
          StorageService.saveNoteToDrive(newNote); 
        };
        reader.readAsText(file);
      }
    });
  };

  const handleAnalyze = async (note: Note) => {
    setAiPanelOpen(true);
    setAiLoading(true);
    const result = await GeminiService.analyzeNote(note, notes);
    setAiResponse(result);
    setAiLoading(false);
  };

  const toggleEditor = () => {
    // If Editor is Hidden (GRAPH), Show it (SPLIT)
    if (viewMode === ViewMode.GRAPH) {
      setViewMode(ViewMode.SPLIT);
    } 
    // If Editor is Visible in Split, Hide it (GRAPH)
    else if (viewMode === ViewMode.SPLIT) {
      setViewMode(ViewMode.GRAPH);
    }
    // If Editor is Full Screen (EDITOR), Do nothing or maybe show Graph? 
    // Keeping "Toggle" behavior: Button indicates visibility.
  };

  const toggleGraph = () => {
    // If Graph is Hidden (EDITOR), Show it (SPLIT)
    if (viewMode === ViewMode.EDITOR) {
      setViewMode(ViewMode.SPLIT);
    } 
    // If Graph is Visible in Split, Hide it (EDITOR)
    else if (viewMode === ViewMode.SPLIT) {
      setViewMode(ViewMode.EDITOR);
    }
  };

  const activeNote = notes.find(n => n.id === activeNoteId);
  const filteredNotes = notes.filter(n => 
    n.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isEditorVisible = viewMode === ViewMode.EDITOR || viewMode === ViewMode.SPLIT;
  const isGraphVisible = viewMode === ViewMode.GRAPH || viewMode === ViewMode.SPLIT;

  return (
    <div className="flex h-screen w-screen bg-cognito-dark text-gray-200 overflow-hidden font-sans relative">
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        onSave={() => syncDrive()}
      />

      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/80 z-20 md:hidden backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div 
        className={`
          flex flex-col border-r border-cognito-border bg-black/95 md:bg-black/40 backdrop-blur-md transition-all duration-300 
          absolute md:relative z-30 h-full 
          ${isSidebarOpen ? 'w-64 translate-x-0' : '-translate-x-full w-0 opacity-0 overflow-hidden md:w-0'}
        `}
      >
        <div className="p-4 flex items-center justify-between border-b border-cognito-border">
          <h1 className="text-xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cognito-orange to-cognito-pink">
            COGNITO
          </h1>
          <button onClick={createNote} className="p-1 hover:bg-white/10 rounded text-cognito-green">
            <Plus size={20} />
          </button>
        </div>
        
        <div className="p-4 space-y-4">
            <div className="relative">
                <Search size={16} className="absolute left-3 top-2.5 text-gray-500" />
                <input 
                    type="text" 
                    placeholder="Pesquisar notas..." 
                    className="w-full bg-[#1a1a1a] border border-cognito-border rounded-lg py-2 pl-9 pr-3 text-sm focus:border-cognito-blue focus:outline-none transition-colors"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
            
            <label className="flex items-center justify-center w-full px-4 py-2 border border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-cognito-purple hover:text-cognito-purple transition-colors text-sm text-gray-400">
                <Upload size={16} className="mr-2" />
                Importar Markdown
                <input type="file" multiple accept=".md" className="hidden" onChange={handleImport} />
            </label>
        </div>

        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {filteredNotes.map(note => (
            <div 
              key={note.id}
              onClick={() => {
                  setActiveNoteId(note.id);
                  if (window.innerWidth < 768) setIsSidebarOpen(false);
              }}
              className={`group flex items-center justify-between px-3 py-2 rounded-md cursor-pointer text-sm transition-all ${activeNoteId === note.id ? 'bg-cognito-blue/20 text-cognito-blue' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
            >
              <div className="flex items-center overflow-hidden flex-1">
                <FileText size={14} className="mr-2 opacity-70 flex-shrink-0" />
                
                {editingNoteId === note.id ? (
                  <div className="flex items-center flex-1" onClick={(e) => e.stopPropagation()}>
                    <input 
                      type="text" 
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameSubmit(note.id);
                        if (e.key === 'Escape') setEditingNoteId(null);
                      }}
                      autoFocus
                      className="bg-[#000] border border-cognito-blue rounded px-1 py-0.5 text-xs text-white w-full focus:outline-none"
                    />
                    <button onClick={() => handleRenameSubmit(note.id)} className="ml-1 text-cognito-green hover:bg-white/10 rounded p-0.5">
                      <Check size={12} />
                    </button>
                    <button onClick={() => setEditingNoteId(null)} className="ml-1 text-red-400 hover:bg-white/10 rounded p-0.5">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <span className="truncate" title={note.title}>{note.title}</span>
                )}
              </div>

              {editingNoteId !== note.id && (
                <div className="flex items-center ml-2 space-x-1">
                    <button 
                      onClick={(e) => handleStartRename(e, note)}
                      className="p-1.5 hover:bg-white/10 rounded text-gray-500 hover:text-white transition-colors"
                      title="Renomear"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button 
                      onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Tem certeza que deseja excluir "${note.title}"?`)) {
                              handleDeleteNote(note);
                          }
                      }}
                      className="p-1.5 hover:bg-red-900/30 rounded text-gray-500 hover:text-red-400 transition-colors"
                      title="Excluir"
                    >
                      <Trash2 size={14} />
                    </button>
                </div>
              )}
            </div>
          ))}
        </div>
        
        <div className="p-4 border-t border-cognito-border text-xs text-gray-600 flex items-center justify-between">
            <div className="flex items-center space-x-2">
                <span>{notes.length} notas</span>
                {isSyncing && <RefreshCw size={12} className="animate-spin text-cognito-green" />}
            </div>
            <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
                title="Configurações"
            >
                <Settings size={14} />
            </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 bg-cognito-dark relative z-10">
        <header className="h-14 border-b border-cognito-border flex items-center justify-between px-4 bg-[#0a0a0a]">
           <div className="flex items-center space-x-3">
             <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-white/5 rounded">
                <Layout size={18} />
             </button>
             <div className="flex bg-[#1a1a1a] rounded-lg p-1 space-x-1">
                <button 
                    onClick={toggleEditor}
                    title="Alternar Editor"
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${isEditorVisible ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    Editor
                </button>
                <button 
                    onClick={toggleGraph}
                    title="Alternar Grafo"
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${isGraphVisible ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    Grafo
                </button>
             </div>
           </div>
           
           <div className="flex items-center space-x-2">
             <div className="flex items-center text-xs text-gray-500 mr-2">
               <span className={`w-2 h-2 rounded-full mr-2 transition-colors ${saveStatus === 'saved' ? 'bg-cognito-green' : saveStatus === 'saving' ? 'bg-cognito-orange animate-pulse' : 'bg-gray-500'}`}></span>
               {saveStatus === 'saved' ? 'Sincronizado' : saveStatus === 'saving' ? 'Sincronizando...' : 'Alterado'}
             </div>
           </div>
        </header>

        <main className="flex-1 relative overflow-hidden flex flex-col md:flex-row">
            {isGraphVisible && (
                <div className={`${viewMode === ViewMode.SPLIT ? 'h-1/2 md:h-full w-full md:w-1/2 md:border-r border-b md:border-b-0 border-cognito-border' : 'w-full h-full'} transition-all duration-300 relative`}>
                    <Graph 
                        notes={filteredNotes} 
                        activeNoteId={activeNoteId} 
                        onNodeClick={setActiveNoteId} 
                    />
                </div>
            )}

            {isEditorVisible && (
                <div className={`${viewMode === ViewMode.SPLIT ? 'h-1/2 md:h-full w-full md:w-1/2' : 'w-full h-full'} transition-all duration-300 bg-cognito-dark flex flex-col border-l border-cognito-border`}>
                    {activeNote ? (
                        <Editor 
                            note={activeNote} 
                            notes={notes}
                            onUpdate={updateNote}
                            onAnalyze={handleAnalyze}
                            onNavigate={handleNavigate}
                            onDelete={handleDeleteNote}
                            saveStatus={saveStatus}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <Network size={64} className="mb-4 text-cognito-blue opacity-20" />
                            <p>Selecione uma nota ou crie uma nova.</p>
                        </div>
                    )}
                </div>
            )}

            {aiPanelOpen && (
                <div className="absolute right-0 top-0 bottom-0 w-80 bg-[#121212] border-l border-cognito-border shadow-2xl transform transition-transform z-20 flex flex-col">
                    <div className="p-4 border-b border-cognito-border flex items-center justify-between">
                        <div className="flex items-center text-cognito-purple">
                            <Sparkles size={18} className="mr-2" />
                            <h2 className="font-bold">Assistente Gemini</h2>
                        </div>
                        <button onClick={() => setAiPanelOpen(false)} className="text-gray-500 hover:text-white">
                            <X size={18} />
                        </button>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto font-mono text-sm leading-relaxed text-gray-300">
                        {aiLoading ? (
                            <div className="flex items-center justify-center h-40">
                                <Loader2 className="animate-spin text-cognito-purple" size={32} />
                            </div>
                        ) : (
                            <div className="prose prose-invert prose-sm">
                                {aiResponse ? (
                                    <div className="whitespace-pre-wrap">{aiResponse}</div>
                                ) : (
                                    <p className="text-gray-500 italic">A análise aparecerá aqui...</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </main>
      </div>
    </div>
  );
};

export default App;