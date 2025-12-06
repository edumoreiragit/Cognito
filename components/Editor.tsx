import React, { useState, useEffect } from 'react';
import { Note } from '../types';
import { Save, BrainCircuit, Loader2 } from 'lucide-react';
import { COLORS } from '../constants';

interface EditorProps {
  note: Note;
  onUpdate: (updatedNote: Note) => void;
  onSaveToDrive: (note: Note) => void;
  onAnalyze: (note: Note) => void;
  isSaving: boolean;
}

const Editor: React.FC<EditorProps> = ({ note, onUpdate, onSaveToDrive, onAnalyze, isSaving }) => {
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');

  // Simple markdown renderer for preview
  const renderMarkdown = (text: string) => {
    let html = text
      .replace(/^# (.*$)/gim, '<h1 class="text-3xl font-bold mb-4 text-cognito-orange">$1</h1>')
      .replace(/^## (.*$)/gim, '<h2 class="text-2xl font-semibold mb-3 text-cognito-blue">$1</h2>')
      .replace(/^### (.*$)/gim, '<h3 class="text-xl font-medium mb-2 text-cognito-green">$1</h3>')
      .replace(/\*\*(.*)\*\*/gim, '<strong class="text-cognito-yellow">$1</strong>')
      .replace(/\*(.*)\*/gim, '<em class="text-gray-300">$1</em>')
      .replace(/\[\[(.*?)\]\]/g, '<span class="text-cognito-pink underline cursor-pointer hover:text-white transition-colors">[[ $1 ]]</span>')
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
            className="p-2 text-cognito-green hover:bg-white/10 rounded-full transition-all"
            title="Pedir análise à IA"
          >
            <BrainCircuit size={18} />
          </button>
          <button 
            onClick={() => onSaveToDrive(note)}
            disabled={isSaving}
            className={`p-2 rounded-full transition-all flex items-center ${isSaving ? 'text-gray-500' : 'text-cognito-orange hover:bg-white/10'}`}
            title="Salvar no Drive"
          >
            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
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
            dangerouslySetInnerHTML={renderMarkdown(note.content)}
          />
        )}
      </div>
    </div>
  );
};

export default Editor;