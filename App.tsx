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
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.SPLIT); 
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

  // Function to sync drive - SOURCE OF TRUTH logic
  const syncDrive = useCallback(async () => {
      setIsSyncing(true);
      try {
        const result = await StorageService.fetchNotesFromDrive();
        const driveNotes = (Array.isArray(result) ? result : []) as Note[];
        
        if (driveNotes.length > 0) {
            setNotes(prevNotes => {
                // 1. Create a map of Drive Notes for easy lookup
                const driveNoteMap = new Map(driveNotes.map(n => [n.title, n]));
                
                // 2. Build the new state based on Drive as the master list.
                // Any note currently in 'prevNotes' that is NOT in 'driveNotes' will effectively be removed
                // because we are mapping primarily over 'driveNotes' to rebuild the list.
                
                const mergedNotes: Note[] = driveNotes.map(dNote => {
                    // Check if we have a local version of this note
                    const localNote = prevNotes.find(p => p.title === dNote.title);
                    
                    // Conflict Resolution:
                    // If local exists and has a newer timestamp than Drive (user typed recently but hasn't synced), keep local content.
                    // Otherwise, accept Drive content.
                    const remoteLastModified = (dNote as any).lastModified || 0;
                    const localLastModified = localNote ? (localNote.lastModified || 0) : 0;
                    
                    if (localNote && localLastModified > remoteLastModified) {
                        return { ...localNote, id: localNote.id || dNote.id }; // Keep local
                    } else {
                        return { ...dNote, id: localNote ? localNote.id : dNote.id }; // Accept Drive, preserve ID if possible
                    }
                });

                // 3. Save this clean state to local storage immediately
                // This ensures that next refresh, deleted files are gone from local storage too.
                localStorage.setItem('cognito_notes_v1', JSON.stringify(mergedNotes));
                
                return mergedNotes;
            });
        } else {
            // Edge case: If Drive returns EMPTY list (and not error), it implies all files were deleted?
            // Safer to assume if we got a 200 OK but empty list, user deleted everything.
            // But let's be careful not to wipe on connection error. 
            // The fetchNotesFromDrive returns [] on error, so we need to be careful.
            // For now, we only update if length > 0 to prevent accidental wipe on network fail.
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
    
    // Initial Sync
    syncDrive();
    
    // Optional: Setup a polling interval to check for deletions in Drive every 30 seconds
    const interval = setInterval(() => {
        if (!document.hidden) { // Only sync if tab is active
            syncDrive();
        }
    }, 30000);

    if (loadedNotes.length > 0) {
      if (!activeNoteId) setActiveNoteId(loadedNotes[0].id);
    } else {
        // Only create welcome note if local storage is empty AND drive sync hasn't populated yet
        // We defer this slightly or let the UI handle empty state
    }
    
    return () => clearInterval(interval);
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
    
    if (viewMode === ViewMode.GRAPH) setViewMode(ViewMode.SPLIT);
    if (window.innerWidth < 768) setIsSidebarOpen(false);

    setSaveStatus('saving');
    try {
        await StorageService.saveNoteToDrive(newNote);
        setSaveStatus('saved');
        // Re-sync after create to confirm
        syncDrive();
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
    // 1. Update UI immediately
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
      // Re-sync to ensure state matches Drive
      setTimeout(syncDrive, 1000);
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
      setTimeout(syncDrive, 1000);
    } catch (error) {
      setSaveStatus('unsaved');
    }
  };

  const handleNavigate = (title: string) => {
      const targetNote = notes.find(n => n.title.toLowerCase() === title.toLowerCase());
      if (targetNote) {
          setActiveNoteId(targetNote.id);
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

  // Improved Toggle Logic
  const toggleEditor = () => {
    if (viewMode === ViewMode.GRAPH) {
      setViewMode(ViewMode.SPLIT);
    } else if (viewMode === ViewMode.SPLIT) {
      setViewMode(ViewMode.GRAPH);
    }
  };

  const toggleGraph = () => {
    if (viewMode === ViewMode.EDITOR) {
      setViewMode(ViewMode.SPLIT);
    } else if (viewMode === ViewMode.SPLIT) {
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