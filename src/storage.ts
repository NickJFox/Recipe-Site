import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppData } from "./types";

const STORAGE_KEY = "recipe-keeper-data-v1";

export async function loadAppData() {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as AppData;
  } catch {
    return null;
  }
}

export async function saveAppData(data: AppData) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
