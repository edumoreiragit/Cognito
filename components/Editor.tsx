import React, { useState, useEffect } from 'react';
import { Note } from '../types';
import { Cloud, Check, BrainCircuit, Loader2, CloudUpload, Trash2 } from 'lucide-react';
import { COLORS } from '../constants';

interface EditorProps {
  note: Note;
  onUpdate: (updatedNote: Note) => void;
  onAnalyze: (note: Note) => void;
  onNavigate: (title: string) => void;
  onDelete: (note: Note) => void;
  saveStatus: 'saved' | 'saving' | 'unsaved';
}

const Editor: React.FC<EditorProps> = ({ note, onUpdate, onAnalyze, onNavigate, onDelete, saveStatus }) => {
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');

  // Simple markdown renderer for preview
  const renderMarkdown = (text: string) => {
    let html = text
      .replace(/^# (.*$)/gim, '<h1 class="text-3xl font-bold mb-4 text-cognito-orange">$1</h1>')
      .replace(/^## (.*$)/gim, '<h2 class="text-2xl font-semibold mb-3 text-cognito-blue">$1</h2>')
      .replace(/^### (.*$)/gim, '<h3 class="text-xl font-medium mb-2 text-cognito-green">$1</h3>')
      .replace(/\*\*(.*)\*\*/gim, '<strong class="text-cognito-yellow">$1</strong>')
      .replace(/\*(.*)\*/gim, '<em class="text-gray-300">$1</em>')
      // Changed: Add data-link-target attribute to identify the link target
      .replace(/\[\[(.*?)\]\]/g, '<span class="text-cognito-pink underline cursor-pointer hover:text-white transition-colors" data-link-target="$1" title="Ir para $1">$1</span>')
      .replace(/\n/gim, '<br />');
    return { __html: html };
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdate({
      ...note,
      content: e.target.value,
      lastModified: Date.now()
    });
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate({
      ...note,
      title: e.target.value,
      lastModified: Date.now()
    });
  };

  const handlePreviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Check if the clicked element is our link span
    if (target.tagName === 'SPAN' && target.dataset.linkTarget) {
      e.preventDefault();
      onNavigate(target.dataset.linkTarget);
    }
  };

  const handleDelete = () => {
    if (window.confirm(`Tem certeza que deseja excluir "${note.title}"? Esta ação moverá o arquivo para a lixeira do Google Drive.`)) {
      onDelete(note);
    }
  };

  // Status icon logic
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
    <div className="flex flex-col h-full bg-cognito-panel text-white rounded-lg border border-cognito-border overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#1a1a1a] border-b border-cognito-border">
        <input 
          type="text" 
          value={note.title} 
          onChange={handleTitleChange}
          className="bg-transparent text-xl font-bold text-cognito-orange focus:outline-none w-full mr-4 placeholder-gray-600"
          placeholder="Título da Nota..."
        />
        <div className="flex items-center space-x-2">
          {renderSaveStatus()}
          
          <div className="w-px h-6 bg-gray-700 mx-2"></div>
          
          <button 
            onClick={() => setActiveTab('write')}
            className={`px-3 py-1 rounded text-sm transition-colors ${activeTab === 'write' ? 'bg-cognito-blue text-white' : 'text-gray-400 hover:text-white'}`}
          >
            Editar
          </button>
          <button 
            onClick={() => setActiveTab('preview')}
            className={`px-3 py-1 rounded text-sm transition-colors ${activeTab === 'preview' ? 'bg-cognito-purple text-white' : 'text-gray-400 hover:text-white'}`}
          >
            Visualizar
          </button>
          
          <div className="w-px h-6 bg-gray-700 mx-2"></div>
          
          <button 
            onClick={() => onAnalyze(note)}
            className="p-2 text-cognito-green hover:bg-white/10 rounded-full transition-all flex items-center space-x-2"
            title="Pedir análise à IA"
          >
            <BrainCircuit size={18} />
            <span className="hidden xl:inline text-xs">Analisar</span>
          </button>

          <button 
            onClick={handleDelete}
            className="p-2 text-red-500 hover:bg-red-500/10 rounded-full transition-all flex items-center justify-center ml-1"
            title="Excluir nota"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'write' ? (
          <textarea
            value={note.content}
            onChange={handleChange}
            className="w-full h-full bg-transparent p-6 resize-none focus:outline-none font-mono text-sm leading-relaxed text-gray-300 selection:bg-cognito-blue selection:text-white"
            placeholder="Comece a escrever... Use [[links]] para conectar ideias."
          />
        ) : (
          <div 
            className="w-full h-full p-6 overflow-y-auto prose prose-invert max-w-none"
            onClick={handlePreviewClick} // Event delegation wrapper
            dangerouslySetInnerHTML={renderMarkdown(note.content)}
          />
        )}
      </div>
    </div>
  );
};

export default Editor;