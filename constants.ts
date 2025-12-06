export const APP_NAME = "Cognito";

// Google Apps Script Web App URL provided by the user
export const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbzWouXmZ2QdXnndx5ht5zS5TZv6sUEv83Y8R5XhFQodfQ8jF2TUL2-DS9mBnJ84PeX8aw/exec";

// In a real deployment, strictly use process.env.API_KEY. 
// For this specific request, the user provided a key which we are using as a fallback if the env var isn't set in the GitHub Actions secrets yet.
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
