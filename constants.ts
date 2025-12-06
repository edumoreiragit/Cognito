export const APP_NAME = "Cognito";

// Default URL provided by the developer. Users can override this in settings.
export const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbzJTGk9afSjxMDiBvMxg0eS1AKOGiagh_eFxfz7TTz_H9PkXt5BPchoaMiEJduoEjmsRA/exec";

// In a real deployment, strictly use process.env.API_KEY. 
// For this specific request, the user provided a key which we are using as a fallback if the env var isn't set.
export const GEMINI_API_KEY = process.env.API_KEY || "AIzaSyALHaBXPBd_PVl0frvVMOOGDhud524uRqA";

export const GOOGLE_DRIVE_FOLDER_ID = "1t4wFInpUaQKZqVsYYrERURmnJjJChkp5";

export const COLORS = {
  orange: '#FF7500',
  green: '#35FF00',
  yellow: '#FFFF00',
  blue: '#0081FF',
  purple: '#8B00FF',
  pink: '#FF007F',
};