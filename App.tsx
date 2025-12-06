import React, { useState, useEffect, useCallback } from 'react';
import { Note, ViewMode } from './types';
import * as StorageService from './services/storageService';
import * as GeminiService from './services/geminiService';
import Graph from './components/Graph';
import Editor from './components/Editor';
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
  RefreshCw
} from 'lucide-react';

const App: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.SPLIT);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Auto-save states
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [typingTimeout, setTypingTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiResponse, setAiResponse] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);

  // Load notes on mount and Sync with Drive
  useEffect(() => {
    // 1. Load Local
    const loadedNotes = StorageService.getNotesFromLocal();
    setNotes(loadedNotes);
    
    if (loadedNotes.length > 0) {
      if (!activeNoteId) setActiveNoteId(loadedNotes[0].id);
    } else {
        // Default note logic...
        const welcome: Note = {
            id: 'welcome-note',
            title: 'Bem-vindo ao Cognito',
            content: '# Bem-vindo\n\nEste é o seu novo segundo cérebro. Comece criando uma nova nota ou importando seus arquivos Markdown do Obsidian.\n\nUse [[WikiLinks]] para conectar pensamentos.\n\nEste aplicativo sincroniza com o seu Google Drive.',
            lastModified: Date.now()
        };
        StorageService.saveNoteToLocal(welcome);
        setNotes([welcome]);
        setActiveNoteId(welcome.id);
    }

    // 2. Sync from Drive (Background)
    const syncDrive = async () => {
        setIsSyncing(true);
        // Explicitly cast to Note[] to fix TypeScript 'unknown' type error
        const driveNotes = await StorageService.fetchNotesFromDrive() as Note[];
        
        if (driveNotes.length > 0) {
            setNotes(prevNotes => {
                const newNoteMap = new Map(prevNotes.map(n => [n.title, n]));
                let hasChanges = false;

                driveNotes.forEach((dNote: Note) => {
                    const localNote = newNoteMap.get(dNote.title);
                    // If local doesn't exist OR Drive is newer, update/add
                    if (!localNote || (dNote.lastModified > (localNote.lastModified || 0))) {
                        // Use local ID if exists to preserve active state/graph, else new ID
                        const noteToSave = { ...dNote, id: localNote ? localNote.id : dNote.id };
                        newNoteMap.set(dNote.title, noteToSave);
                        StorageService.saveNoteToLocal(noteToSave);
                        hasChanges = true;
                    }
                });

                return hasChanges ? Array.from(newNoteMap.values()) : prevNotes;
            });
        }
        setIsSyncing(false);
    };

    syncDrive();

  }, []); // Run once on mount

  const createNote = () => {
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: 'Nota Sem Título',
      content: '',
      lastModified: Date.now()
    };
    const updatedNotes = [...notes, newNote];
    setNotes(updatedNotes);
    StorageService.saveNoteToLocal(newNote);
    setActiveNoteId(newNote.id);
    
    // Auto switch to editor if in graph mode
    if (viewMode === ViewMode.GRAPH) setViewMode(ViewMode.SPLIT);
  };

  const updateNote = (updatedNote: Note) => {
    // 1. Instant Local Update
    const updatedNotes = notes.map(n => n.id === updatedNote.id ? updatedNote : n);
    setNotes(updatedNotes);
    StorageService.saveNoteToLocal(updatedNote);

    // 2. Debounced Cloud Sync
    setSaveStatus('unsaved');
    
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }

    // Wait 2 seconds after user stops typing to save to Drive
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

  const handleNavigate = (title: string) => {
      // Find note by title (case insensitive)
      const targetNote = notes.find(n => n.title.toLowerCase() === title.toLowerCase());
      if (targetNote) {
          setActiveNoteId(targetNote.id);
          // If we are in graph only mode, switch to split or editor to see the note
          if (viewMode === ViewMode.GRAPH) setViewMode(ViewMode.SPLIT);
      } else {
          // Optional: You could ask to create the note here.
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

  const activeNote = notes.find(n => n.id === activeNoteId);
  const filteredNotes = notes.filter(n => 
    n.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen w-screen bg-cognito-dark text-gray-200 overflow-hidden font-sans">
      {/* Sidebar */}
      <div className={`flex flex-col border-r border-cognito-border bg-black/40 backdrop-blur-md transition-all duration-300 ${isSidebarOpen ? 'w-64' : 'w-0 opacity-0 overflow-hidden'}`}>
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
              onClick={() => setActiveNoteId(note.id)}
              className={`group flex items-center px-3 py-2 rounded-md cursor-pointer text-sm transition-all ${activeNoteId === note.id ? 'bg-cognito-blue/20 text-cognito-blue' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
            >
              <FileText size={14} className="mr-2 opacity-70" />
              <span className="truncate">{note.title}</span>
            </div>
          ))}
        </div>
        
        <div className="p-4 border-t border-cognito-border text-xs text-gray-600 text-center flex items-center justify-center space-x-2">
            <span>{notes.length} notas</span>
            {isSyncing && <RefreshCw size={12} className="animate-spin text-cognito-green" />}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-cognito-border flex items-center justify-between px-4 bg-[#0a0a0a]">
           <div className="flex items-center space-x-3">
             <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-white/5 rounded">
                <Layout size={18} />
             </button>
             <div className="flex bg-[#1a1a1a] rounded-lg p-1">
                <button 
                    onClick={() => setViewMode(ViewMode.EDITOR)}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${viewMode === ViewMode.EDITOR ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    Editor
                </button>
                <button 
                    onClick={() => setViewMode(ViewMode.GRAPH)}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${viewMode === ViewMode.GRAPH ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    Grafo
                </button>
                <button 
                    onClick={() => setViewMode(ViewMode.SPLIT)}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${viewMode === ViewMode.SPLIT ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    Dividir
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

        {/* Workspace */}
        <main className="flex-1 relative overflow-hidden flex">
            
            {/* Graph Layer */}
            {(viewMode === ViewMode.GRAPH || viewMode === ViewMode.SPLIT) && (
                <div className={`${viewMode === ViewMode.SPLIT ? 'w-1/2 border-r border-cognito-border' : 'w-full'} h-full transition-all duration-300`}>
                    <Graph 
                        notes={notes} 
                        activeNoteId={activeNoteId} 
                        onNodeClick={setActiveNoteId} 
                    />
                </div>
            )}

            {/* Editor Layer */}
            {(viewMode === ViewMode.EDITOR || viewMode === ViewMode.SPLIT) && (
                <div className={`${viewMode === ViewMode.SPLIT ? 'w-1/2' : 'w-full'} h-full transition-all duration-300 bg-cognito-dark p-4`}>
                    {activeNote ? (
                        <Editor 
                            note={activeNote} 
                            onUpdate={updateNote}
                            onAnalyze={handleAnalyze}
                            onNavigate={handleNavigate}
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

            {/* AI Assistant Panel (Overlay) */}
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