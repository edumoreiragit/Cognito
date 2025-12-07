import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Note } from '../types';
import { 
  Check, BrainCircuit, FileText, 
  CircleArrowLeft, ArrowLeft, Eye, Pencil,
  Bold, Italic, List, Link as LinkIcon, Quote, Code, 
  Heading1, Heading2, Heading3, Minus, ListOrdered, Undo, Redo,
  ExternalLink
} from 'lucide-react';

interface EditorProps {
  note: Note;
  notes: Note[];
  onUpdate: (updatedNote: Note) => void;
  onAnalyze: (note: Note) => void;
  onNavigate: (title: string) => void;
  onDelete: (note: Note) => void;
  onBack: () => void;
  canGoBack: boolean;
  saveStatus?: 'saved' | 'saving' | 'unsaved'; // Added to match usage in App.tsx
  onCreateNote?: (title: string) => void;
}

// CONSTANTE DE ESTILO COMPARTILHADO
// Garante que Textarea e Div Mirror sejam geometricamente IDÊNTICOS
const EDITOR_STYLE: React.CSSProperties = {
    fontFamily: '"Fira Code", "Menlo", "Consolas", monospace',
    fontSize: '16px',
    lineHeight: '1.6',
    padding: '2rem', // p-8 equivalency
    letterSpacing: 'normal',
    tabSize: 2
};

const Editor: React.FC<EditorProps> = ({ note, notes, onUpdate, onAnalyze, onNavigate, onDelete, onBack, canGoBack, onCreateNote }) => {
  // State
  const [isPreview, setIsPreview] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionQuery, setSuggestionQuery] = useState('');
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [triggerIndex, setTriggerIndex] = useState(-1);
  const [cursorOffset, setCursorOffset] = useState(0);
  const [activeLink, setActiveLink] = useState<string | null>(null);
  
  // Custom History State for Undo/Redo
  const [history, setHistory] = useState<string[]>([note.content]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Suggestions logic
  const suggestions = notes
    .filter(n => n.title.toLowerCase().includes(suggestionQuery.toLowerCase()) && n.id !== note.id)
    .slice(0, 5);

  const backlinks = notes.filter(n => 
    n.id !== note.id && 
    n.content.toLowerCase().includes(`[[${note.title.toLowerCase()}]]`)
  );

  // --- UNDO / REDO LOGIC ---
  const saveToHistory = useCallback((newContent: string) => {
    const currentHistory = history.slice(0, historyIndex + 1);
    const lastEntry = currentHistory[currentHistory.length - 1];

    if (lastEntry !== newContent) {
        const newHistory = [...currentHistory, newContent];
        if (newHistory.length > 50) newHistory.shift();
        
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    }
  }, [history, historyIndex]);

  const handleUndo = () => {
    if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        const previousContent = history[newIndex];
        setHistoryIndex(newIndex);
        onUpdate({ ...note, content: previousContent, lastModified: Date.now() });
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        const nextContent = history[newIndex];
        setHistoryIndex(newIndex);
        onUpdate({ ...note, content: nextContent, lastModified: Date.now() });
    }
  };

  useEffect(() => {
    if (history.length === 0) {
        setHistory([note.content]);
    }
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        setIsPreview(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Native Event Listener for Preview Links
  useEffect(() => {
    const container = previewRef.current;
    if (!container || !isPreview) return;

    const handleClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const linkElement = target.closest('button[data-link]'); // Changed to button for semantics
        
        if (linkElement) {
            e.preventDefault();
            e.stopPropagation();
            const linkTitle = linkElement.getAttribute('data-link');
            if (linkTitle) {
                onNavigate(linkTitle);
            }
        }
    };

    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, [isPreview, onNavigate]);

  const checkLinkAtCursor = () => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      
      const cursor = textarea.selectionStart;
      const text = note.content;

      // Look backwards for [[
      const lastOpen = text.lastIndexOf('[[', cursor);
      if (lastOpen === -1) {
          setActiveLink(null);
          return;
      }

      // Look forwards for ]]
      const nextClose = text.indexOf(']]', lastOpen);
      
      // Check if cursor is strictly inside or at boundaries of [[...]]
      if (nextClose !== -1 && nextClose > lastOpen) {
           if (cursor >= lastOpen && cursor <= nextClose + 2) {
               const rawContent = text.substring(lastOpen + 2, nextClose);
               const linkTitle = rawContent.split('|')[0].trim();
               if (linkTitle) {
                   setActiveLink(linkTitle);
                   return;
               }
           }
      }
      setActiveLink(null);
  };

  const insertMarkdown = (prefix: string, suffix: string = '') => {
      if (!textareaRef.current) return;
      
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = note.content;
      
      const selection = text.substring(start, end);
      const before = text.substring(0, start);
      const after = text.substring(end);
      
      const newContent = `${before}${prefix}${selection}${suffix}${after}`;
      
      saveToHistory(newContent);
      onUpdate({ ...note, content: newContent, lastModified: Date.now() });
      
      if (prefix === '[[' && suffix === ']]' && selection.trim().length > 0) {
          if (onCreateNote) {
              onCreateNote(selection.trim());
          }
      }

      setTimeout(() => {
          textarea.focus();
          const newCursorStart = start + prefix.length;
          const newCursorEnd = end + prefix.length;
          textarea.setSelectionRange(newCursorStart, newCursorEnd);
          setCursorOffset(newCursorStart);
          checkLinkAtCursor();
      }, 0);
  };

  const parseMarkdown = (text: string, isPreviewMode: boolean) => {
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    if (isPreviewMode) {
        html = html
          .replace(/^# (.*$)/gim, '<h1 class="text-3xl font-bold text-cognito-orange mt-6 mb-4 border-b border-gray-800 pb-2">$1</h1>')
          .replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold text-cognito-blue mt-5 mb-3">$1</h2>')
          .replace(/^### (.*$)/gim, '<h3 class="text-xl font-bold text-cognito-green mt-4 mb-2">$1</h3>')
          .replace(/^#### (.*$)/gim, '<h4 class="text-lg font-bold text-cognito-purple mt-3 mb-1">$1</h4>')
          .replace(/\*\*(.*?)\*\*/g, '<strong class="text-cognito-yellow">$1</strong>')
          .replace(/\*(.*?)\*/g, '<em class="text-gray-400">$1</em>')
          .replace(/^\d+\. (.*$)/gim, '<li class="ml-4 list-decimal text-gray-300">$1</li>')
          .replace(/^\- (.*$)/gim, '<li class="ml-4 list-disc text-gray-300">$1</li>')
          .replace(/^> (.*$)/gim, '<blockquote class="border-l-4 border-cognito-purple pl-4 italic text-gray-400 my-2">$1</blockquote>')
          .replace(/`(.*?)`/g, '<code class="bg-white/10 px-1.5 py-0.5 rounded text-cognito-pink font-mono text-sm">$1</code>')
          .replace(/^---$/gim, '<hr class="border-gray-700 my-6"/>');

        // Preview Links: Using <button> for better click handling
        html = html.replace(/\[\[(.*?)\]\]/g, (match, p1) => {
             const linkTitle = p1.trim();
             const exists = notes.some(n => n.title.toLowerCase() === linkTitle.toLowerCase());
             const className = exists
                ? "text-cognito-purple hover:underline hover:text-cognito-blue font-bold transition-colors bg-cognito-purple/10 px-1 rounded mx-0.5 cursor-pointer inline-block"
                : "text-gray-500 hover:text-gray-300 cursor-help border-b border-dashed border-gray-600 mx-0.5 inline-block";
             
             const safeLinkTitle = linkTitle.replace(/"/g, '&quot;');
             return `<button data-link="${safeLinkTitle}" class="${className}">${p1}</button>`;
        });
        
        html = html.replace(/\n/g, '<br/>');
        return html;

    } else {
        // --- EDIT MODE ---
        // CRÍTICO: NENHUMA alteração de font-weight ou font-style.
        // Apenas Cores. Isso garante alinhamento 1:1.
        
        html = html
          .replace(/^# (.*$)/gim, '<span class="text-cognito-orange"># $1</span>')
          .replace(/^## (.*$)/gim, '<span class="text-cognito-blue">## $1</span>')
          .replace(/^### (.*$)/gim, '<span class="text-cognito-green">### $1</span>')
          .replace(/\*\*(.*?)\*\*/g, '<span class="text-cognito-yellow">**$1**</span>')
          .replace(/\*(.*?)\*/g, '<span class="text-gray-500">*$1*</span>'); 

        // WikiLinks para Edição
        html = html.replace(/\[\[(.*?)\]\]/g, (match, p1, offset) => {
            const rawTitle = p1;
            const linkTitle = rawTitle.trim(); 
            const exists = notes.some(n => n.title.toLowerCase() === linkTitle.toLowerCase());
            
            // CRÍTICO: Removido 'font-bold' de bracketClass
            const isCursorInside = cursorOffset > offset && cursorOffset < offset + match.length;
            const bracketClass = isCursorInside ? "text-cognito-pink" : "text-transparent"; 
            
            const textClass = exists 
                ? "text-cognito-purple underline decoration-cognito-purple/30 cursor-pointer"
                : "text-gray-500 underline decoration-gray-700 decoration-dashed";
                
            return `<span class="${bracketClass}">[[</span><span class="${textClass}">${rawTitle}</span><span class="${bracketClass}">]]</span>`;
        });
        
        // Mantém quebra de linha natural + break final para scroll
        return html + '<br/>'; 
    }
  };

  const updateScroll = () => {
      if (textareaRef.current && mirrorRef.current) {
          mirrorRef.current.scrollTop = textareaRef.current.scrollTop;
          mirrorRef.current.scrollLeft = textareaRef.current.scrollLeft;
      }
  };

  const handleCursorActivity = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
      const target = e.target as HTMLTextAreaElement;
      setCursorOffset(target.selectionStart);
      updateScroll();
      checkLinkAtCursor();
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const selectionStart = e.target.selectionStart;
    
    // Updates
    setCursorOffset(selectionStart);
    onUpdate({ ...note, content: value, lastModified: Date.now() });
    
    // Autosave/History
    if (historyTimeoutRef.current) clearTimeout(historyTimeoutRef.current);
    historyTimeoutRef.current = setTimeout(() => {
        saveToHistory(value);
    }, 1000);

    // Auto-create Logic ]]
    if (selectionStart >= 2 && value.substring(selectionStart - 2, selectionStart) === ']]') {
        const textBefore = value.substring(0, selectionStart - 2);
        const lastOpen = textBefore.lastIndexOf('[[');
        if (lastOpen !== -1) {
             const contentInside = textBefore.substring(lastOpen + 2);
             if (!contentInside.includes('\n') && !contentInside.includes('[[') && !contentInside.includes(']]')) {
                 if (contentInside.trim().length > 0 && onCreateNote) onCreateNote(contentInside.trim());
             }
        }
    }

    // Suggestions [[
    const textBeforeCursor = value.substring(0, selectionStart);
    const lastOpenBracket = textBeforeCursor.lastIndexOf('[[');
    if (lastOpenBracket !== -1 && !textBeforeCursor.substring(lastOpenBracket).includes(']]')) {
        const query = textBeforeCursor.substring(lastOpenBracket + 2);
        if (!query.includes('\n')) {
            setTriggerIndex(lastOpenBracket);
            setSuggestionQuery(query);
            setShowSuggestions(true);
            setSuggestionIndex(0);
            return; // Don't verify links if we are typing one
        }
    }
    setShowSuggestions(false);
    checkLinkAtCursor();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSuggestionIndex(prev => (prev + 1) % suggestions.length);
            return;
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSuggestionIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
            return;
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            if (suggestions.length > 0) selectSuggestion(suggestions[suggestionIndex]);
            return;
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
            return;
        }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo(); else handleUndo();
        return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
        return;
    }

    // List Logic
    if (e.key === 'Enter' && !e.shiftKey) {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const value = textarea.value;
        const selectionStart = textarea.selectionStart;
        const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
        const lineContent = value.substring(lineStart, selectionStart);
        
        const unorderedMatch = lineContent.match(/^(\s*)-\s(.*)/);
        const orderedMatch = lineContent.match(/^(\s*)(\d+)\.\s(.*)/);

        if (unorderedMatch || orderedMatch) {
            e.preventDefault();
            let newValue, newCursorPos;
            
            if (unorderedMatch) {
                const indent = unorderedMatch[1];
                if (unorderedMatch[2].trim().length === 0) {
                     newValue = value.substring(0, lineStart) + value.substring(selectionStart);
                     newCursorPos = lineStart;
                } else {
                     const insertion = `\n${indent}- `;
                     newValue = value.substring(0, selectionStart) + insertion + value.substring(selectionStart);
                     newCursorPos = selectionStart + insertion.length;
                }
            } else if (orderedMatch) {
                 const indent = orderedMatch[1];
                 const number = parseInt(orderedMatch[2], 10);
                 if (orderedMatch[3].trim().length === 0) {
                     newValue = value.substring(0, lineStart) + value.substring(selectionStart);
                     newCursorPos = lineStart;
                 } else {
                     const insertion = `\n${indent}${number + 1}. `;
                     newValue = value.substring(0, selectionStart) + insertion + value.substring(selectionStart);
                     newCursorPos = selectionStart + insertion.length;
                 }
            }
            
            if (newValue !== undefined && newCursorPos !== undefined) {
                onUpdate({ ...note, content: newValue, lastModified: Date.now() });
                saveToHistory(newValue);
                setTimeout(() => {
                    textarea.selectionStart = textarea.selectionEnd = newCursorPos!;
                    setCursorOffset(newCursorPos!);
                    checkLinkAtCursor();
                }, 0);
            }
            return;
        }
    }

    // Tab Logic
    if (e.key === 'Tab') {
        e.preventDefault();
        const textarea = textareaRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart;
        const spaces = "  ";
        const newValue = textarea.value.substring(0, start) + spaces + textarea.value.substring(textarea.selectionEnd);
        onUpdate({ ...note, content: newValue, lastModified: Date.now() });
        saveToHistory(newValue);
        setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = start + spaces.length;
            setCursorOffset(start + spaces.length);
        }, 0);
    }
  };

  const handleEditorClick = (e: React.MouseEvent<HTMLTextAreaElement>) => {
      handleCursorActivity(e);
      const target = e.target as HTMLTextAreaElement;
      if (target.selectionStart !== target.selectionEnd) return;

      const cursor = target.selectionStart;
      const text = note.content;
      
      const lastOpen = text.lastIndexOf('[[', cursor);
      if (lastOpen === -1) return;

      const nextClose = text.indexOf(']]', lastOpen);

      if (nextClose !== -1 && nextClose > lastOpen && cursor <= nextClose + 2) {
          const content = text.substring(lastOpen + 2, nextClose).split('|')[0].trim();
          if (content) onNavigate(content);
      }
  };

  const selectSuggestion = (selectedNote: Note) => {
    const beforeTrigger = note.content.substring(0, triggerIndex);
    const afterCursor = note.content.substring(textareaRef.current?.selectionStart || 0);
    const newContent = `${beforeTrigger}[[${selectedNote.title}]]${afterCursor}`;
    saveToHistory(newContent);
    onUpdate({ ...note, content: newContent, lastModified: Date.now() });
    setShowSuggestions(false);
    setTimeout(() => {
        if (textareaRef.current) {
            textareaRef.current.focus();
            const newCursorPos = triggerIndex + 2 + selectedNote.title.length + 2;
            textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
            setCursorOffset(newCursorPos); 
            checkLinkAtCursor();
        }
    }, 0);
  };

  const ToolbarBtn = ({ icon: Icon, label, action, color = "text-gray-500", disabled = false }: any) => (
    <button
        onClick={(e) => { e.preventDefault(); if(!disabled) action(); }}
        disabled={disabled}
        className={`p-2 ${disabled ? 'opacity-30 cursor-not-allowed text-gray-600' : color} ${!disabled && 'hover:bg-white/10 hover:text-white hover:scale-110'} rounded transition-all transform`}
        title={label}
    >
        <Icon size={18} />
    </button>
  );

  return (
    <div className="flex flex-col h-full bg-cognito-panel text-white rounded-none overflow-hidden relative">
      {/* Toolbar Top */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#1a1a1a] border-b border-cognito-border shrink-0 z-30 min-h-[60px]">
        <div className="flex items-center flex-1 mr-4 overflow-hidden">
            <button 
                onClick={onBack} 
                disabled={!canGoBack}
                className={`mr-3 p-1.5 rounded-full transition-colors ${canGoBack ? 'text-cognito-blue hover:bg-white/10 cursor-pointer' : 'text-gray-600 cursor-not-allowed opacity-40'}`}
                title="Voltar"
            >
                <ArrowLeft size={20} />
            </button>
            <input 
              type="text" 
              value={note.title} 
              onChange={(e) => onUpdate({ ...note, title: e.target.value, lastModified: Date.now() })}
              className="bg-transparent text-xl font-bold text-cognito-orange focus:outline-none w-full placeholder-gray-600 truncate"
              placeholder="Título da Nota..."
            />
        </div>

        {/* ACTIVE LINK NAVIGATOR BUTTON - FALLBACK */}
        {activeLink && !isPreview && (
             <button 
                onClick={() => onNavigate(activeLink)}
                className="hidden md:flex items-center mr-4 px-3 py-1.5 bg-cognito-purple hover:bg-purple-600 text-white text-xs font-bold rounded-full animate-in fade-in slide-in-from-top-1 shadow-lg shadow-purple-900/50 border border-purple-400 whitespace-nowrap"
             >
                <ExternalLink size={12} className="mr-2" />
                Ir para: {activeLink}
             </button>
        )}

        <div className="flex items-center space-x-3 shrink-0">
          <div className="flex items-center space-x-1 bg-[#121212] p-1 rounded-lg border border-gray-800">
             <button
               onClick={() => setIsPreview(false)}
               className={`p-1.5 rounded transition-colors ${!isPreview ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
               title="Modo Edição (Ctrl+E)"
             >
               <Pencil size={16} />
             </button>
             <button
               onClick={() => setIsPreview(true)}
               className={`p-1.5 rounded transition-colors ${isPreview ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
               title="Modo Leitura (Ctrl+E)"
             >
               <Eye size={16} />
             </button>
          </div>
          <div className="w-px h-6 bg-gray-700 mx-1"></div>
          
          <button 
            onClick={() => onAnalyze(note)}
            className="p-2 text-cognito-green hover:bg-white/10 rounded-full transition-all"
            title="Pedir análise à IA"
          >
            <BrainCircuit size={18} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative flex overflow-hidden">
        
        <div className="flex-1 relative group bg-cognito-dark z-0 text-base leading-relaxed">
            {isPreview ? (
                // --- PREVIEW MODE ---
                <div 
                    ref={previewRef}
                    className="absolute inset-0 p-8 overflow-y-auto break-words text-gray-300 animate-in fade-in duration-200 z-10 select-text cursor-auto"
                    style={{ fontFamily: 'Inter, sans-serif' }} 
                    dangerouslySetInnerHTML={{ __html: parseMarkdown(note.content, true) }}
                />
            ) : (
                // --- EDIT MODE ---
                <>
                    {/* Mirror Layer */}
                    <div 
                        ref={mirrorRef}
                        className="absolute inset-0 whitespace-pre-wrap break-words text-gray-300 pointer-events-none overflow-y-scroll z-0 custom-scrollbar"
                        style={EDITOR_STYLE}
                        dangerouslySetInnerHTML={{ __html: parseMarkdown(note.content, false) }}
                    ></div>

                    {/* Input Layer */}
                    <textarea
                        ref={textareaRef}
                        value={note.content}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        onKeyUp={handleCursorActivity}
                        onClick={handleEditorClick}
                        onScroll={updateScroll}
                        spellCheck={false}
                        className="absolute inset-0 w-full h-full bg-transparent resize-none focus:outline-none z-10 text-transparent caret-white selection:bg-cognito-purple/30 selection:text-transparent overflow-y-scroll custom-scrollbar whitespace-pre-wrap break-words"
                        style={EDITOR_STYLE}
                        placeholder="Comece a escrever... Use [[links]] para conectar ideias."
                    />
                </>
            )}

            {/* Suggestions Dropdown */}
            {!isPreview && showSuggestions && suggestions.length > 0 && (
                <div 
                    className="absolute bg-[#1a1a1a] border border-cognito-border rounded-lg shadow-2xl z-50 w-64 overflow-hidden"
                    style={{ top: '20%', left: '10%', maxHeight: '200px' }}
                >
                    <div className="bg-cognito-purple/10 px-3 py-1 text-xs text-cognito-purple border-b border-white/5 font-semibold">
                        Link para...
                    </div>
                    {suggestions.map((suggestion, index) => (
                        <div
                            key={suggestion.id}
                            onClick={() => selectSuggestion(suggestion)}
                            className={`px-3 py-2 cursor-pointer text-sm flex items-center ${index === suggestionIndex ? 'bg-cognito-purple text-white' : 'text-gray-300 hover:bg-white/5'}`}
                        >
                            <FileText size={12} className="mr-2 opacity-70" />
                            <span className="truncate">{suggestion.title}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>

        {/* Formatting Toolbar */}
        {!isPreview && (
            <div className="w-12 bg-[#121212] border-l border-cognito-border flex flex-col items-center py-4 gap-2 z-20 shrink-0 select-none overflow-y-auto custom-scrollbar">
                <ToolbarBtn icon={Undo} label="Desfazer (Ctrl+Z)" action={handleUndo} disabled={historyIndex <= 0} />
                <ToolbarBtn icon={Redo} label="Refazer (Ctrl+Shift+Z)" action={handleRedo} disabled={historyIndex >= history.length - 1} />
                <div className="w-4 h-px bg-gray-800 my-1"></div>
                <ToolbarBtn icon={LinkIcon} label="Link [[ ]]" action={() => insertMarkdown('[[', ']]')} color="text-cognito-purple" />
                <ToolbarBtn icon={Bold} label="Negrito" action={() => insertMarkdown('**', '**')} />
                <ToolbarBtn icon={Italic} label="Itálico" action={() => insertMarkdown('*', '*')} />
                <div className="w-4 h-px bg-gray-800 my-1"></div>
                <ToolbarBtn icon={Heading1} label="Título 1" action={() => insertMarkdown('# ')} color="text-cognito-orange" />
                <ToolbarBtn icon={Heading2} label="Título 2" action={() => insertMarkdown('## ')} color="text-cognito-blue" />
                <ToolbarBtn icon={Heading3} label="Título 3" action={() => insertMarkdown('### ')} color="text-cognito-green" />
                <div className="w-4 h-px bg-gray-800 my-1"></div>
                <ToolbarBtn icon={List} label="Lista Marcadores" action={() => insertMarkdown('- ')} />
                <ToolbarBtn icon={ListOrdered} label="Lista Numerada" action={() => insertMarkdown('1. ')} />
                <ToolbarBtn icon={Quote} label="Citação" action={() => insertMarkdown('> ')} />
                <ToolbarBtn icon={Code} label="Código" action={() => insertMarkdown('`', '`')} />
                <ToolbarBtn icon={Minus} label="Divisor" action={() => insertMarkdown('\n---\n')} />
            </div>
        )}

      </div>
      
      {/* Footer Backlinks */}
      {backlinks.length > 0 && (
          <div className="bg-[#121212] border-t border-cognito-border p-4 shrink-0 max-h-48 overflow-y-auto z-30 relative">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center">
                  <CircleArrowLeft size={14} className="mr-1.5" />
                  Notas que referenciam esta (Backlinks)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {backlinks.map(bn => (
                      <div
                          key={bn.id}
                          onClick={(e) => {
                              e.stopPropagation();
                              onNavigate(bn.title);
                          }}
                          className="p-3 rounded bg-white/5 hover:bg-white/10 cursor-pointer transition-colors group border border-transparent hover:border-cognito-border"
                      >
                          <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-cognito-purple group-hover:underline flex items-center">
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