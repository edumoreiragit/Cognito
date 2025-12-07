import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Note } from '../types';
import { 
  Cloud, Check, BrainCircuit, Loader2, CloudUpload, FileText, 
  CircleArrowLeft, ArrowLeft, Eye, Pencil,
  Bold, Italic, List, Link as LinkIcon, Quote, Code, 
  Heading1, Heading2, Heading3, Minus, ListOrdered, Undo, Redo
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
  saveStatus: 'saved' | 'saving' | 'unsaved';
  onCreateNote?: (title: string) => void;
}

const Editor: React.FC<EditorProps> = ({ note, notes, onUpdate, onAnalyze, onNavigate, onDelete, onBack, canGoBack, saveStatus, onCreateNote }) => {
  // State
  const [isPreview, setIsPreview] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionQuery, setSuggestionQuery] = useState('');
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [triggerIndex, setTriggerIndex] = useState(-1);
  const [cursorOffset, setCursorOffset] = useState(0);
  
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
    // If we are at an index distinct from the end, slice the future off
    const currentHistory = history.slice(0, historyIndex + 1);
    const lastEntry = currentHistory[currentHistory.length - 1];

    if (lastEntry !== newContent) {
        const newHistory = [...currentHistory, newContent];
        // Limit history size to 50 steps to save memory
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

  // Sync initial note content to history if changed externally (rare in this app, but good practice)
  useEffect(() => {
    if (history.length === 0) {
        setHistory([note.content]);
    }
  }, []);

  // Shortcut for Toggle View (Ctrl+E)
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
        const linkElement = target.closest('span[data-link]');
        
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
      
      // Save directly to history for toolbar actions
      saveToHistory(newContent);
      onUpdate({ ...note, content: newContent, lastModified: Date.now() });
      
      // If it's a link and there is selection, Create the note immediately
      if (prefix === '[[' && suffix === ']]' && selection.trim().length > 0) {
          if (onCreateNote) {
              onCreateNote(selection.trim());
          }
      }

      // Restore focus and set cursor position inside the tags
      setTimeout(() => {
          textarea.focus();
          const newCursorStart = start + prefix.length;
          const newCursorEnd = end + prefix.length;
          textarea.setSelectionRange(newCursorStart, newCursorEnd);
          setCursorOffset(newCursorStart);
      }, 0);
  };

  const parseMarkdown = (text: string, isPreviewMode: boolean) => {
    // Basic Escaping
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    if (isPreviewMode) {
        // --- PREVIEW MODE ---
        html = html
          .replace(/^# (.*$)/gim, '<h1 class="text-3xl font-bold text-cognito-orange mt-6 mb-4 border-b border-gray-800 pb-2">$1</h1>')
          .replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold text-cognito-blue mt-5 mb-3">$1</h2>')
          .replace(/^### (.*$)/gim, '<h3 class="text-xl font-bold text-cognito-green mt-4 mb-2">$1</h3>')
          .replace(/^#### (.*$)/gim, '<h4 class="text-lg font-bold text-cognito-purple mt-3 mb-1">$1</h4>')
          .replace(/\*\*(.*?)\*\*/g, '<strong class="text-cognito-yellow">$1</strong>')
          .replace(/\*(.*?)\*/g, '<em class="text-gray-400">$1</em>')
          // Ordered List (basic support for 1. 2. 3.)
          .replace(/^\d+\. (.*$)/gim, '<li class="ml-4 list-decimal text-gray-300">$1</li>')
          // Unordered List
          .replace(/^\- (.*$)/gim, '<li class="ml-4 list-disc text-gray-300">$1</li>')
          
          .replace(/^> (.*$)/gim, '<blockquote class="border-l-4 border-cognito-purple pl-4 italic text-gray-400 my-2">$1</blockquote>')
          .replace(/`(.*?)`/g, '<code class="bg-white/10 px-1.5 py-0.5 rounded text-cognito-pink font-mono text-sm">$1</code>')
          .replace(/^---$/gim, '<hr class="border-gray-700 my-6"/>');
    } else {
        // --- EDIT MODE ---
        html = html
          .replace(/^# (.*$)/gim, '<span class="text-cognito-orange font-bold"># $1</span>')
          .replace(/^## (.*$)/gim, '<span class="text-cognito-blue font-bold">## $1</span>')
          .replace(/^### (.*$)/gim, '<span class="text-cognito-green font-bold">### $1</span>')
          .replace(/\*\*(.*?)\*\*/g, '<span class="text-cognito-yellow font-bold">**$1**</span>')
          .replace(/\*(.*?)\*/g, '<span class="italic text-gray-500">*$1*</span>');
    }

    // WikiLinks
    html = html.replace(/\[\[(.*?)\]\]/g, (match, p1, offset) => {
        const rawTitle = p1;
        const linkTitle = rawTitle.trim(); 
        
        if (!isPreviewMode) {
            const start = offset;
            const end = offset + match.length;
            const isCursorInside = cursorOffset > start && cursorOffset < end;
            const bracketClass = isCursorInside ? "text-cognito-pink font-semibold" : "text-transparent select-none";
            
            const exists = notes.some(n => n.title.toLowerCase() === linkTitle.toLowerCase());
            const textClass = exists 
                ? "text-cognito-purple underline decoration-cognito-purple/30 cursor-pointer font-medium"
                : "text-gray-500 underline decoration-gray-700 decoration-dashed";
            return `<span class="${bracketClass}">[[</span><span class="${textClass}">${rawTitle}</span><span class="${bracketClass}">]]</span>`;
        } else {
             const exists = notes.some(n => n.title.toLowerCase() === linkTitle.toLowerCase());
             const className = exists
                ? "text-cognito-purple hover:underline hover:text-cognito-blue font-bold transition-colors bg-cognito-purple/10 px-1 rounded mx-0.5 cursor-pointer pointer-events-auto"
                : "text-gray-500 hover:text-gray-300 cursor-help border-b border-dashed border-gray-600 mx-0.5 pointer-events-auto";
             
             const safeLinkTitle = linkTitle.replace(/"/g, '&quot;');
             return `<span data-link="${safeLinkTitle}" class="${className}">${rawTitle}</span>`;
        }
    });

    html = html.replace(/\n/g, '<br/>');
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
    onUpdate({ ...note, content: value, lastModified: Date.now() });

    // Debounce history save for normal typing
    if (historyTimeoutRef.current) clearTimeout(historyTimeoutRef.current);
    historyTimeoutRef.current = setTimeout(() => {
        saveToHistory(value);
    }, 1000);

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
    // 1. Suggestions Navigation
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

    // 2. Undo / Redo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
            handleRedo();
        } else {
            handleUndo();
        }
        return;
    }
    // Also support Ctrl+Y for Redo
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
        return;
    }

    // 3. Auto-continue List on Enter
    if (e.key === 'Enter' && !e.shiftKey) {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const value = textarea.value;
        const selectionStart = textarea.selectionStart;

        // Find start of the current line
        const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
        const lineContent = value.substring(lineStart, selectionStart);

        // Regex for Unordered List (- item)
        const unorderedMatch = lineContent.match(/^(\s*)-\s(.*)/);
        // Regex for Ordered List (1. item)
        const orderedMatch = lineContent.match(/^(\s*)(\d+)\.\s(.*)/);

        if (unorderedMatch) {
            e.preventDefault();
            const indent = unorderedMatch[1];
            const content = unorderedMatch[2].trim(); // Text after marker

            let newValue;
            let newCursorPos;

            if (content.length === 0) {
                // Empty list item: Remove the "- " and exit list mode (standard Obsidian/Word behavior)
                // We remove from lineStart to selectionStart
                newValue = value.substring(0, lineStart) + value.substring(selectionStart);
                newCursorPos = lineStart;
            } else {
                // Continue list
                const insertion = `\n${indent}- `;
                newValue = value.substring(0, selectionStart) + insertion + value.substring(selectionStart);
                newCursorPos = selectionStart + insertion.length;
            }

            onUpdate({ ...note, content: newValue, lastModified: Date.now() });
            saveToHistory(newValue);
            
            setTimeout(() => {
                textarea.selectionStart = textarea.selectionEnd = newCursorPos;
                setCursorOffset(newCursorPos);
            }, 0);
            return;
        }

        if (orderedMatch) {
            e.preventDefault();
            const indent = orderedMatch[1];
            const number = parseInt(orderedMatch[2], 10);
            const content = orderedMatch[3].trim();

            let newValue;
            let newCursorPos;

            if (content.length === 0) {
                // Empty list item: Remove the "1. " and exit
                newValue = value.substring(0, lineStart) + value.substring(selectionStart);
                newCursorPos = lineStart;
            } else {
                // Continue list with next number
                const insertion = `\n${indent}${number + 1}. `;
                newValue = value.substring(0, selectionStart) + insertion + value.substring(selectionStart);
                newCursorPos = selectionStart + insertion.length;
            }

            onUpdate({ ...note, content: newValue, lastModified: Date.now() });
            saveToHistory(newValue);

            setTimeout(() => {
                textarea.selectionStart = textarea.selectionEnd = newCursorPos;
                setCursorOffset(newCursorPos);
            }, 0);
            return;
        }
    }

    // 4. Tab Indentation
    if (e.key === 'Tab') {
        e.preventDefault();
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = textarea.value;

        // Insert 2 spaces
        const spaces = "  ";
        const newValue = value.substring(0, start) + spaces + value.substring(end);
        
        onUpdate({ ...note, content: newValue, lastModified: Date.now() });
        saveToHistory(newValue);

        setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = start + spaces.length;
            setCursorOffset(start + spaces.length);
        }, 0);
    }
  };

  const handleEditorClick = (e: React.MouseEvent<HTMLTextAreaElement>) => {
      updateCursorAndScroll(e);
      const target = e.target as HTMLTextAreaElement;
      const clickIndex = target.selectionStart;
      const regex = /\[\[(.*?)\]\]/g;
      let match;
      while ((match = regex.exec(note.content)) !== null) {
          const start = match.index;
          const end = match.index + match[0].length;
          if (clickIndex >= start && clickIndex <= end) {
              const linkTitle = match[1];
              const trimmedTitle = linkTitle.trim();
              
              if ((e.ctrlKey || e.metaKey) || !isPreview) { 
                  const targetNote = notes.find(n => n.title.toLowerCase() === trimmedTitle.toLowerCase());
                  if (targetNote && e.altKey) onNavigate(targetNote.title);
              }
              break;
          }
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
        }
    }, 0);
  };

  const renderSaveStatus = () => {
    switch (saveStatus) {
      case 'saving': return <Loader2 size={16} className="animate-spin text-cognito-orange" />;
      case 'saved': return <Cloud size={16} className="text-cognito-green" />;
      case 'unsaved': return <CloudUpload size={16} className="text-gray-400" />;
    }
  };

  // Toolbar Button Component
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
      <div className="flex items-center justify-between px-4 py-3 bg-[#1a1a1a] border-b border-cognito-border shrink-0 z-30">
        <div className="flex items-center flex-1 mr-4">
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
              className="bg-transparent text-xl font-bold text-cognito-orange focus:outline-none w-full placeholder-gray-600"
              placeholder="Título da Nota..."
            />
        </div>

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
          <div className="flex items-center space-x-2" title="Status de Salvamento">
             {renderSaveStatus()}
          </div>
          <button 
            onClick={() => onAnalyze(note)}
            className="p-2 text-cognito-green hover:bg-white/10 rounded-full transition-all"
            title="Pedir análise à IA"
          >
            <BrainCircuit size={18} />
          </button>
        </div>
      </div>

      {/* Main Content Area (Flex Row for Toolbar) */}
      <div className="flex-1 relative flex overflow-hidden">
        
        {/* Editor/Preview Container */}
        <div className="flex-1 relative group bg-cognito-dark z-0 font-mono text-sm leading-relaxed">
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
                    {/* Background Highlighter */}
                    <div 
                        ref={mirrorRef}
                        className="absolute inset-0 p-6 whitespace-pre-wrap break-words text-gray-300 pointer-events-none overflow-hidden z-0"
                        style={{ fontFamily: 'monospace', lineHeight: '1.625' }}
                        dangerouslySetInnerHTML={{ __html: parseMarkdown(note.content, false) }}
                    ></div>

                    {/* Foreground Textarea */}
                    <textarea
                        ref={textareaRef}
                        value={note.content}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        onKeyUp={updateCursorAndScroll}
                        onClick={handleEditorClick}
                        onScroll={updateCursorAndScroll}
                        spellCheck={false}
                        className="absolute inset-0 w-full h-full bg-transparent p-6 resize-none focus:outline-none z-10 text-transparent caret-white selection:bg-cognito-purple/30 selection:text-transparent"
                        style={{ fontFamily: 'monospace', lineHeight: '1.625' }}
                        placeholder="Comece a escrever... Use [[links]] para conectar ideias."
                    />
                </>
            )}

            {/* Autocomplete Dropdown */}
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

        {/* Right Side Formatting Toolbar (Only visible in Edit Mode) */}
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
      
      {/* Backlinks Panel (Footer) */}
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