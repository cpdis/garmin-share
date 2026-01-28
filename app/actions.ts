"use server";

import { put } from "@vercel/blob";
import { randomUUID } from "crypto";

type UploadResult =
  | { success: true; id: string; url: string }
  | { success: false; error: string };

export async function uploadWorkout(formData: FormData): Promise<UploadResult> {
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return { success: false, error: "No file provided" };
  }

  const name = file.name.toLowerCase();
  const isFit = name.endsWith(".fit");
  const isJson = name.endsWith(".json");

  if (!isFit && !isJson) {
    return { success: false, error: "Must be a .FIT or .JSON file" };
  }

  if (file.size > 5 * 1024 * 1024) {
    return { success: false, error: "File too large (max 5MB)" };
  }

  // Validate content
  if (isJson) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.workoutName && !data.workoutSegments) {
        return { success: false, error: "Invalid Garmin workout JSON" };
      }
    } catch {
      return { success: false, error: "Invalid JSON file" };
    }
  }

  if (isFit) {
    const buffer = await file.arrayBuffer();
    if (buffer.byteLength < 14) {
      return { success: false, error: "Invalid FIT file" };
    }
  }

  const id = randomUUID().slice(0, 8);
  const ext = isFit ? "fit" : "json";

  await put(`workouts/${id}.${ext}`, file, {
    access: "public",
    addRandomSuffix: false,
  });

  return { success: true, id, url: `/w/${id}` };
}
