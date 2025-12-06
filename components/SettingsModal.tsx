import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Save, ExternalLink, FolderOpen, Server, Code } from 'lucide-react';
import * as StorageService from '../services/storageService';
import { GAS_ENDPOINT } from '../constants';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSave }) => {
  const [activeTab, setActiveTab] = useState<'config' | 'tutorial'>('config');
  const [folderId, setFolderId] = useState('');
  const [gasUrl, setGasUrl] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const config = StorageService.getAppConfig();
      setFolderId(config.folderId);
      setGasUrl(config.gasUrl || GAS_ENDPOINT);
    }
  }, [isOpen]);

  const handleSave = () => {
    StorageService.saveAppConfig({
      folderId,
      gasUrl
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
    onSave();
  };

  const generateGasCode = () => {
    const targetFolderId = folderId.trim() || "SEU_ID_DA_PASTA_AQUI";
    
    return `// CÓDIGO DO SERVIDOR COGNITO
// Copie e cole este código no arquivo 'Código.gs' do seu projeto Google Apps Script

function doGet(e) {
  // ID da pasta configurada no App
  const folderId = "${targetFolderId}"; 
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFilesByType("text/markdown");
  
  const notes = [];
  
  while (files.hasNext()) {
    const file = files.next();
    notes.push({
      id: file.getId(),
      title: file.getName().replace(".md", ""),
      content: file.getBlob().getDataAsString(),
      lastModified: file.getLastUpdated().getTime()
    });
  }
  
  return ContentService.createTextOutput(JSON.stringify(notes))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const folderId = "${targetFolderId}"; 
  const folder = DriveApp.getFolderById(folderId);
  
  let result = {};

  // AÇÃO: SALVAR (CRIAR OU ATUALIZAR)
  if (data.action === "save") {
    const fileName = data.title + ".md";
    const files = folder.getFilesByName(fileName);
    
    if (files.hasNext()) {
      const file = files.next();
      file.setContent(data.content);
    } else {
      folder.createFile(fileName, data.content, "text/markdown");
    }
    
    result = {status: "success"};
  }
  
  // AÇÃO: EXCLUIR (MOVER PARA LIXEIRA)
  else if (data.action === "delete") {
    const fileName = data.title + ".md";
    const files = folder.getFilesByName(fileName);
    
    while (files.hasNext()) {
      const file = files.next();
      file.setTrashed(true);
    }
    
    result = {status: "deleted"};
  }

  // AÇÃO: RENOMEAR
  else if (data.action === "rename") {
    const oldName = data.oldTitle + ".md";
    const newName = data.newTitle + ".md";
    const files = folder.getFilesByName(oldName);
    
    if (files.hasNext()) {
      const file = files.next();
      file.setName(newName);
      result = {status: "renamed"};
    } else {
      result = {status: "error", error: "File not found"};
    }
  } else {
    result = {status: "error", error: "Invalid action"};
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}`;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generateGasCode());
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#121212] border border-cognito-border rounded-xl w-full max-w-4xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-cognito-border bg-[#0a0a0a]">
          <h2 className="text-xl font-bold text-white flex items-center">
            <Server className="mr-2 text-cognito-purple" size={20} />
            Configuração do Servidor
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-cognito-border bg-[#1a1a1a]">
          <button 
            onClick={() => setActiveTab('config')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'config' ? 'text-cognito-blue border-b-2 border-cognito-blue bg-white/5' : 'text-gray-400 hover:text-white'}`}
          >
            Conexão
          </button>
          <button 
            onClick={() => setActiveTab('tutorial')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'tutorial' ? 'text-cognito-green border-b-2 border-cognito-green bg-white/5' : 'text-gray-400 hover:text-white'}`}
          >
            Como Instalar (Tutorial)
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-cognito-dark">
          
          {activeTab === 'config' && (
            <div className="space-y-6 max-w-2xl mx-auto">
               <div className="bg-cognito-blue/10 border border-cognito-blue/30 rounded-lg p-4 mb-6">
                <p className="text-sm text-gray-200">
                  Configure aqui a conexão com seu Google Drive. Siga o tutorial na aba ao lado para criar seu próprio servidor.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-cognito-orange flex items-center">
                  <FolderOpen size={16} className="mr-2" />
                  ID da Pasta Google Drive
                </label>
                <input 
                  type="text" 
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                  placeholder="Ex: 1t4wFInpUaQKZqVsYYrERURmnJjJChkp5"
                  className="w-full bg-[#0a0a0a] border border-cognito-border rounded-lg p-3 text-white focus:border-cognito-orange focus:outline-none font-mono text-sm"
                />
                <p className="text-xs text-gray-500">
                  O código alfanumérico no final da URL da sua pasta no Drive.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-cognito-purple flex items-center">
                  <ExternalLink size={16} className="mr-2" />
                  URL do Web App (Apps Script)
                </label>
                <input 
                  type="text" 
                  value={gasUrl}
                  onChange={(e) => setGasUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/..."
                  className="w-full bg-[#0a0a0a] border border-cognito-border rounded-lg p-3 text-white focus:border-cognito-purple focus:outline-none font-mono text-sm"
                />
              </div>

              <div className="pt-4 flex justify-end">
                <button 
                  onClick={handleSave}
                  className="flex items-center bg-cognito-blue hover:bg-blue-600 text-white px-6 py-2 rounded-lg font-medium transition-all"
                >
                  {savedSuccess ? <Check size={18} className="mr-2" /> : <Save size={18} className="mr-2" />}
                  {savedSuccess ? 'Salvo!' : 'Salvar Configuração'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'tutorial' && (
            <div className="space-y-8">
              {/* Step 1 */}
              <div className="border border-cognito-border rounded-lg p-5 bg-[#1a1a1a]">
                <h3 className="text-lg font-bold text-cognito-green mb-2">1. Preparar o Google Drive</h3>
                <ol className="list-decimal list-inside space-y-2 text-gray-300 text-sm">
                  <li>Crie uma nova pasta no seu Google Drive (ex: "Cognito Notes").</li>
                  <li>Abra a pasta e olhe para a URL no navegador.</li>
                  <li>Copie o código após <code>folders/</code>. Este é o seu <strong>ID da Pasta</strong>.</li>
                  <li>
                    <span className="text-cognito-orange">Cole o ID no campo abaixo</span> para gerar seu código personalizado:
                  </li>
                </ol>
                <input 
                  type="text" 
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                  placeholder="Cole o ID da pasta aqui..."
                  className="mt-3 w-full bg-black border border-gray-700 rounded p-2 text-white font-mono text-sm focus:border-cognito-green focus:outline-none"
                />
              </div>

              {/* Step 2 */}
              <div className="border border-cognito-border rounded-lg p-5 bg-[#1a1a1a]">
                <h3 className="text-lg font-bold text-cognito-yellow mb-2">2. Criar o Script</h3>
                <ol className="list-decimal list-inside space-y-2 text-gray-300 text-sm">
                  <li>Acesse <a href="https://script.google.com/" target="_blank" className="text-blue-400 underline">script.google.com</a> e clique em "Novo Projeto".</li>
                  <li>Apague todo o código existente no arquivo <code>Código.gs</code>.</li>
                  <li>Copie o código gerado abaixo (ele inclui as funções de salvar, excluir e <strong>renomear</strong>):</li>
                </ol>
                
                <div className="relative mt-4">
                  <div className="absolute top-2 right-2">
                    <button 
                      onClick={copyToClipboard}
                      className="flex items-center px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-xs text-white transition-colors"
                    >
                      {copiedCode ? <Check size={14} className="mr-1" /> : <Copy size={14} className="mr-1" />}
                      {copiedCode ? 'Copiado!' : 'Copiar Código'}
                    </button>
                  </div>
                  <pre className="bg-[#050505] p-4 rounded-lg border border-gray-800 text-xs font-mono text-gray-300 overflow-x-auto h-64">
                    <code>{generateGasCode()}</code>
                  </pre>
                </div>
              </div>

              {/* Step 3 */}
              <div className="border border-cognito-border rounded-lg p-5 bg-[#1a1a1a]">
                <h3 className="text-lg font-bold text-cognito-pink mb-2">3. Implantar</h3>
                <ol className="list-decimal list-inside space-y-2 text-gray-300 text-sm">
                  <li>No Apps Script, clique no botão azul <strong>Implantar</strong> &gt; <strong>Nova implantação</strong>.</li>
                  <li>Clique na engrenagem ao lado de "Selecione o tipo" e escolha <strong>App da Web</strong>.</li>
                  <li>Em "Descrição", digite "Cognito v3".</li>
                  <li>Em "Executar como", mantenha <strong>Eu</strong>.</li>
                  <li>
                    <span className="text-red-400 font-bold">IMPORTANTE:</span> Em "Quem pode acessar", selecione <strong>Qualquer pessoa</strong>.
                  </li>
                  <li>Clique em <strong>Implantar</strong>.</li>
                  <li>Copie a URL e cole na aba "Conexão".</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;