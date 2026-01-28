import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  try {
    const workout = await request.json();

    // Validate it looks like a Garmin workout
    if (!workout.workoutName && !workout.workoutSegments) {
      return NextResponse.json(
        { error: "Invalid workout data - missing workoutName or workoutSegments" },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    // Basic validation of workout structure
    if (workout.workoutSegments && !Array.isArray(workout.workoutSegments)) {
      return NextResponse.json(
        { error: "Invalid workout data - workoutSegments must be an array" },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    const id = randomUUID().slice(0, 8);
    const content = JSON.stringify(workout, null, 2);

    // Size check (~5MB max)
    if (content.length > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Workout data too large" },
        { status: 413, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    await put(`workouts/${id}.json`, content, {
      access: "public",
      addRandomSuffix: false,
      contentType: "application/json",
    });

    return NextResponse.json(
      { id, url: `/w/${id}` },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Upload error:", error);

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid JSON" },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}

// Handle CORS preflight for extension
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
