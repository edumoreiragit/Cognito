import { Note, DriveResponse } from '../types';
import { GAS_ENDPOINT } from '../constants';

const STORAGE_KEY = 'cognito_notes_v1';

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

// New function to fetch notes from Drive
export const fetchNotesFromDrive = async (): Promise<Note[]> => {
  try {
    const response = await fetch(GAS_ENDPOINT);
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
    console.warn("Could not fetch from Drive (requires doGet implementation in GAS):", error);
    return [];
  }
};

export const saveNoteToDrive = async (note: Note): Promise<DriveResponse> => {
  try {
    const payload = {
      action: "save",
      title: note.title,
      content: note.content,
      lastModified: note.lastModified
    };

    const response = await fetch(GAS_ENDPOINT, {
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