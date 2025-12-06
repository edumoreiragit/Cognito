import { Note, DriveResponse } from '../types';
import { GAS_ENDPOINT } from '../constants';

const STORAGE_KEY = 'cognito_notes_v1';
const CONFIG_KEY = 'cognito_config_v1';

interface AppConfig {
  gasUrl: string;
  folderId: string;
}

// Configuration Management
export const getAppConfig = (): AppConfig => {
  try {
    const data = localStorage.getItem(CONFIG_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Failed to load config", e);
  }
  // Return defaults if no config found
  return {
    gasUrl: GAS_ENDPOINT,
    folderId: ""
  };
};

export const saveAppConfig = (config: AppConfig): void => {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
};

// Local Storage for Notes
export const saveNoteToLocal = (note: Note): void => {
  const notes = getNotesFromLocal();
  const index = notes.findIndex(n => n.id === note.id);
  if (index >= 0) {
    notes[index] = note;
  } else {
    notes.push(note);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
};

export const deleteNoteFromLocal = (id: string): void => {
  const notes = getNotesFromLocal();
  const filtered = notes.filter(n => n.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
};

export const getNotesFromLocal = (): Note[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to load notes", e);
    return [];
  }
};

// Drive Sync
export const fetchNotesFromDrive = async (): Promise<Note[]> => {
  try {
    const config = getAppConfig();
    const endpoint = config.gasUrl;

    if (!endpoint) return [];

    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error("Failed to connect to Google Apps Script");
    }
    const data = await response.json();
    
    // Validate if data is array
    if (Array.isArray(data)) {
        return data.map((item: any) => ({
            id: item.id || crypto.randomUUID(), // Ensure ID exists
            title: item.title,
            content: item.content,
            lastModified: item.lastModified || Date.now()
        }));
    }
    return [];
  } catch (error) {
    console.warn("Could not fetch from Drive:", error);
    return [];
  }
};

export const saveNoteToDrive = async (note: Note): Promise<DriveResponse> => {
  try {
    const config = getAppConfig();
    const endpoint = config.gasUrl;

    const payload = {
      action: "save",
      title: note.title,
      content: note.content,
      lastModified: note.lastModified
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'text/plain;charset=utf-8', 
      },
    });

    if (!response.ok) {
        return { status: 'error', error: response.statusText };
    }

    const data = await response.json();
    return data as DriveResponse;
  } catch (error: any) {
    console.warn("Drive sync warning:", error);
    return { status: 'unknown', error: error.message };
  }
};