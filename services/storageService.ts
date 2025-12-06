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

export const saveNoteToDrive = async (note: Note): Promise<DriveResponse> => {
  try {
    // The Google Apps Script expects a specific payload structure
    const payload = {
      action: "save",
      title: note.title,
      content: note.content
    };

    // Using no-cors mode because GAS Web Apps don't support CORS preflight perfectly for simple POSTs 
    // without complex setup. However, 'no-cors' returns an opaque response.
    // Given the constraints, we attempt a standard fetch. If it fails due to CORS,
    // we might need to assume success or use a hidden iframe/form technique (deprecated).
    // For this implementation, we try standard JSON.
    
    const response = await fetch(GAS_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(payload),
      // Often text/plain avoids CORS preflight triggers compared to application/json in some environments,
      // but the GAS script provided parses JSON.
      headers: {
        'Content-Type': 'text/plain;charset=utf-8', 
      },
    });

    if (!response.ok) {
        // If opaque (no-cors), we won't get here easily with standard fetch settings,
        // but let's handle standard errors.
        return { status: 'error', error: response.statusText };
    }

    const data = await response.json();
    return data as DriveResponse;
  } catch (error: any) {
    console.warn("Drive sync warning (likely CORS, but saved):", error);
    // In many GAS implementations, the request succeeds but the browser blocks the response reading.
    // We treat network errors cautiously.
    return { status: 'unknown', error: error.message };
  }
};
