import React, { useState, useEffect, useRef } from 'react';
import { Note } from '../types';
import { Cloud, Check, BrainCircuit, Loader2, CloudUpload, FileText, ArrowLeftCircle, ArrowLeft } from 'lucide-react';
import { COLORS } from '../constants';

interface EditorProps {
  note: Note;
  notes: Note[];
  onUpdate: (updatedNote: Note) => void;
  onAnalyze: (note: Note) => void;
  onNavigate: (title: string) => void;
  onDelete: (note: Note) => void;
  onBack: () => void;
  canGoBack: boolean;
  saveStatus: 'saved' | 'saving' | 'unsaved';
}

const Editor: React.FC<EditorProps> = ({ note, notes, onUpdate, onAnalyze, onNavigate, onDelete, onBack, canGoBack, saveStatus }) => {
  // Autocomplete State
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionQuery, setSuggestionQuery] = useState('');
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [triggerIndex, setTriggerIndex] = useState(-1);
  
  // Cursor tracking for "Live Preview" effect
  const [cursorOffset, setCursorOffset] = useState(0);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);

  // Filter notes based on query for autocomplete
  const suggestions = notes
    .filter(n => n.title.toLowerCase().includes(suggestionQuery.toLowerCase()) && n.id !== note.id)
    .slice(0, 5); // Limit to 5 suggestions

  // Calculate Backlinks
  const backlinks = notes.filter(n => 
    n.id !== note.id && 
    n.content.toLowerCase().includes(`[[${note.title.toLowerCase()}]]`)
  );

  const highlightMarkdown = (text: string) => {
    // 1. Basic Escaping
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // 2. Headers & Formatting (Order matters: standard inline first)
    html = html
      // Headers
      .replace(/^# (.*$)/gim, '<span class="text-cognito-orange font-bold text-xl"># $1</span>')
      .replace(/^## (.*$)/gim, '<span class="text-cognito-blue font-bold text-lg">## $1</span>')
      .replace(/^### (.*$)/gim, '<span class="text-cognito-green font-bold">### $1</span>')
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<span class="text-cognito-yellow font-bold">**$1**</span>')
      // Italic
      .replace(/\*(.*?)\*/g, '<span class="italic text-gray-400">*$1*</span>');

    // 3. Dynamic WikiLinks Logic
    html = html.replace(/\[\[(.*?)\]\]/g, (match, p1, offset) => {
        const start = offset;
        const end = offset + match.length;
        
        const isCursorInside = cursorOffset > start && cursorOffset < end;
        
        const bracketClass = isCursorInside ? "text-cognito-pink font-semibold" : "text-transparent select-none";
        const textClass = "text-cognito-blue underline decoration-cognito-blue/30 cursor-pointer";

        return `<span class="${bracketClass}">[[</span><span class="${textClass}">${p1}</span><span class="${bracketClass}">]]</span>`;
    });

    // 4. Line Breaks
    html = html.replace(/\n/g, '<br/>');

    // Add a trailing break to ensure scrolling matches if cursor is at very end
    return html + '<br/>'; 
  };

  const updateCursorAndScroll = (e: React.SyntheticEvent<HTMLTextAreaElement> | React.MouseEvent) => {
      const target = e.target as HTMLTextAreaElement;
      setCursorOffset(target.selectionStart);
      
      if (textareaRef.current && mirrorRef.current) {
          mirrorRef.current.scrollTop = textareaRef.current.scrollTop;
      }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const selectionStart = e.target.selectionStart;

    setCursorOffset(selectionStart);

    onUpdate({
      ...note,
      content: value,
      lastModified: Date.now()
    });

    // Autocomplete Logic
    const textBeforeCursor = value.substring(0, selectionStart);
    const lastOpenBracket = textBeforeCursor.lastIndexOf('[[');
    
    if (lastOpenBracket !== -1 && !textBeforeCursor.substring(lastOpenBracket).includes(']]')) {
        const query = textBeforeCursor.substring(lastOpenBracket + 2);
        if (!query.includes('\n')) {
            setTriggerIndex(lastOpenBracket);
            setSuggestionQuery(query);
            setShowSuggestions(true);
            setSuggestionIndex(0);
            return;
        }
    }

    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSuggestionIndex(prev => (prev + 1) % suggestions.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSuggestionIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            if (suggestions.length > 0) selectSuggestion(suggestions[suggestionIndex]);
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLTextAreaElement>) => {
      updateCursorAndScroll(e);

      // Link Navigation Logic
      const target = e.target as HTMLTextAreaElement;
      const clickIndex = target.selectionStart;
      const content = note.content;

      const regex = /\[\[(.*?)\]\]/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
          const start = match.index;
          const end = match.index + match[0].length;
          
          if (clickIndex >= start && clickIndex <= end) {
              const linkTitle = match[1];
              const targetNote = notes.find(n => n.title.toLowerCase() === linkTitle.toLowerCase());
              
              if (targetNote && !e.altKey) {
                  onNavigate(targetNote.title);
              }
              break;
          }
      }
  };

  const selectSuggestion = (selectedNote: Note) => {
    const beforeTrigger = note.content.substring(0, triggerIndex);
    const afterCursor = note.content.substring(textareaRef.current?.selectionStart || 0);
    const newContent = `${beforeTrigger}[[${selectedNote.title}]]${afterCursor}`;
    
    onUpdate({ ...note, content: newContent, lastModified: Date.now() });
    setShowSuggestions(false);
    
    setTimeout(() => {
        if (textareaRef.current) {
            textareaRef.current.focus();
            const newCursorPos = triggerIndex + 2 + selectedNote.title.length + 2;
            textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
            setCursorOffset(newCursorPos); 
        }
    }, 0);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate({ ...note, title: e.target.value, lastModified: Date.now() });
  };

  const renderSaveStatus = () => {
    switch (saveStatus) {
      case 'saving':
        return (
          <div className="flex items-center text-cognito-orange space-x-2 px-3 py-1 bg-white/5 rounded-full" title="Salvando no Drive...">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-xs">Salvando...</span>
          </div>
        );
      case 'saved':
        return (
          <div className="flex items-center text-cognito-green space-x-2 px-3 py-1 bg-white/5 rounded-full" title="Sincronizado com Drive">
            <Cloud size={16} />
            <span className="text-xs">Salvo</span>
          </div>
        );
      case 'unsaved':
      default:
        return (
          <div className="flex items-center text-gray-400 space-x-2 px-3 py-1 bg-white/5 rounded-full" title="Alterações pendentes">
            <CloudUpload size={16} />
            <span className="text-xs">Pendente...</span>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full bg-cognito-panel text-white rounded-none overflow-hidden relative">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#1a1a1a] border-b border-cognito-border shrink-0 z-20">
        <div className="flex items-center flex-1 mr-4">
            <button 
                onClick={onBack} 
                disabled={!canGoBack}
                className={`mr-3 p-1.5 rounded-full transition-colors ${canGoBack ? 'text-cognito-blue hover:bg-white/10' : 'text-gray-600 cursor-not-allowed opacity-50'}`}
                title="Voltar"
            >
                <ArrowLeft size={20} />
            </button>
            <input 
            type="text" 
            value={note.title} 
            onChange={handleTitleChange}
            className="bg-transparent text-xl font-bold text-cognito-orange focus:outline-none w-full placeholder-gray-600"
            placeholder="Título da Nota..."
            />
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          {renderSaveStatus()}
          
          <div className="w-px h-6 bg-gray-700 mx-2"></div>
          
          <button 
            onClick={() => onAnalyze(note)}
            className="p-2 text-cognito-green hover:bg-white/10 rounded-full transition-all flex items-center space-x-2"
            title="Pedir análise à IA"
          >
            <BrainCircuit size={18} />
            <span className="hidden xl:inline text-xs">Analisar</span>
          </button>
        </div>
      </div>

      {/* Content Area - Hybrid Mode */}
      <div className="flex-1 relative font-mono text-sm leading-relaxed group">
        
        {/* The Highlighter Layer (Bottom) */}
        <div 
            ref={mirrorRef}
            className="absolute inset-0 p-6 whitespace-pre-wrap break-words text-gray-300 pointer-events-none overflow-hidden z-0"
            style={{ 
                fontFamily: 'monospace',
                lineHeight: '1.625' 
             }}
            dangerouslySetInnerHTML={{ __html: highlightMarkdown(note.content) }}
        ></div>

        {/* The Editing Layer (Top) */}
        <textarea
            ref={textareaRef}
            value={note.content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onKeyUp={updateCursorAndScroll}
            onClick={handleClick}
            onScroll={updateCursorAndScroll}
            spellCheck={false}
            className="absolute inset-0 w-full h-full bg-transparent p-6 resize-none focus:outline-none z-10 text-transparent caret-white selection:bg-cognito-blue/30 selection:text-transparent"
            style={{ 
                fontFamily: 'monospace',
                lineHeight: '1.625' 
            }}
            placeholder="Comece a escrever... Use [[links]] para conectar ideias."
        />

        {/* Autocomplete Dropdown */}
        {showSuggestions && suggestions.length > 0 && (
            <div 
                className="absolute bg-[#1a1a1a] border border-cognito-border rounded-lg shadow-2xl z-50 w-64 overflow-hidden"
                style={{ 
                    top: '20%',
                    left: '10%',
                    maxHeight: '200px'
                }}
            >
                <div className="bg-cognito-blue/10 px-3 py-1 text-xs text-cognito-blue border-b border-white/5 font-semibold">
                    Link para...
                </div>
                {suggestions.map((suggestion, index) => (
                    <div
                        key={suggestion.id}
                        onClick={() => selectSuggestion(suggestion)}
                        className={`px-3 py-2 cursor-pointer text-sm flex items-center ${index === suggestionIndex ? 'bg-cognito-blue text-white' : 'text-gray-300 hover:bg-white/5'}`}
                    >
                        <FileText size={12} className="mr-2 opacity-70" />
                        <span className="truncate">{suggestion.title}</span>
                    </div>
                ))}
            </div>
        )}
      </div>
      
      {/* Backlinks Panel (Footer) */}
      {backlinks.length > 0 && (
          <div className="bg-[#121212] border-t border-cognito-border p-4 shrink-0 max-h-48 overflow-y-auto z-20">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center">
                  <ArrowLeftCircle size={14} className="mr-1.5" />
                  Notas que referenciam esta (Backlinks)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {backlinks.map(bn => (
                      <div
                          key={bn.id}
                          onClick={() => onNavigate(bn.title)}
                          className="p-3 rounded bg-white/5 hover:bg-white/10 cursor-pointer transition-colors group border border-transparent hover:border-cognito-border"
                      >
                          <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-cognito-blue group-hover:underline flex items-center">
                                  <FileText size={12} className="mr-2 opacity-70" />
                                  {bn.title}
                              </span>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      )}
    </div>
  );
};

export default Editor;