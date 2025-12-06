import { GoogleGenAI } from "@google/genai";
import { GEMINI_API_KEY } from '../constants';
import { Note } from '../types';

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export const analyzeNote = async (currentNote: Note, allNotes: Note[]): Promise<string> => {
  try {
    // Fornece contexto sobre a nota atual e títulos de outras notas para encontrar conexões.
    const noteTitles = allNotes.map(n => n.title).join(", ");
    
    const prompt = `
      Analise a seguinte nota intitulada "${currentNote.title}".
      
      Conteúdo:
      ${currentNote.content}

      Contexto:
      O usuário possui uma base de conhecimento com os seguintes títulos de notas: ${noteTitles}.

      Tarefa:
      1. Resuma o conceito principal desta nota em Português.
      2. Sugira 3 conexões potenciais ou "Backlinks" para notas existentes ou novos tópicos baseados no conteúdo.
      3. Identifique quaisquer "obras seminais" ou referências mencionadas.

      Formate a saída em Markdown limpo.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "Não foi possível gerar uma análise no momento.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Erro ao conectar com a IA. Verifique a API Key.";
  }
};

export const chatWithBrain = async (history: string[], message: string, contextNotes: Note[]): Promise<string> => {
  try {
    // Cria uma string de contexto de todas as notas
    
    const context = contextNotes.map(n => `Título: ${n.title}\nConteúdo: ${n.content.substring(0, 200)}...`).join("\n---\n");

    const systemInstruction = `
      Você é o Cognito, um assistente de pesquisa intelectual. 
      Você tem acesso às notas do usuário.
      Sempre responda em Português.
      Seja sofisticado, conciso e prestativo.
      
      Contexto das Notas:
      ${context}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: message,
      config: {
        systemInstruction: systemInstruction,
      }
    });

    return response.text || "Sem resposta.";
  } catch (error) {
     console.error("Gemini Chat Error:", error);
     return "Desculpe, estou tendo problemas para processar sua solicitação.";
  }
};