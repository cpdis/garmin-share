import { head } from "@vercel/blob";
import { notFound } from "next/navigation";
import { Decoder, Stream } from "@garmin/fitsdk";
import Link from "next/link";

interface WorkoutData {
  name: string;
  sport: string;
  description?: string;
  steps: WorkoutStep[];
  downloadUrl: string;
  format: "fit" | "json";
}

interface WorkoutStep {
  type: string;
  duration?: string;
  target?: string;
}

async function findWorkoutBlob(id: string) {
  for (const ext of ["json", "fit"] as const) {
    try {
      const blob = await head(`workouts/${id}.${ext}`);
      return { blob, format: ext };
    } catch {
      // Try next extension
    }
  }
  return null;
}

interface GarminWorkoutJson {
  workoutName?: string;
  description?: string;
  sportType?: { sportTypeKey?: string };
  workoutSegments?: Array<{
    workoutSteps?: Array<{
      stepType?: { stepTypeKey?: string };
      endCondition?: { conditionTypeKey?: string };
      endConditionValue?: number;
      targetType?: { workoutTargetTypeKey?: string };
      targetValueOne?: number;
      targetValueTwo?: number;
    }>;
  }>;
}

function parseJsonWorkout(
  data: GarminWorkoutJson
): Omit<WorkoutData, "downloadUrl" | "format"> {
  const steps: WorkoutStep[] = [];

  for (const segment of data.workoutSegments || []) {
    for (const step of segment.workoutSteps || []) {
      const type = step.stepType?.stepTypeKey || "interval";
      let duration: string | undefined;
      let target: string | undefined;

      const condition = step.endCondition?.conditionTypeKey;
      const value = step.endConditionValue;

      if (condition === "time" && value) {
        const mins = Math.floor(value / 60);
        const secs = value % 60;
        duration = secs
          ? `${mins}:${secs.toString().padStart(2, "0")}`
          : `${mins}:00`;
      } else if (condition === "distance" && value) {
        duration = `${(value / 1000).toFixed(1)} km`;
      } else if (condition === "lap.button") {
        duration = "Lap button";
      }

      const targetType = step.targetType?.workoutTargetTypeKey;
      if (
        targetType === "pace.zone" &&
        step.targetValueOne &&
        step.targetValueTwo
      ) {
        const formatPace = (secs: number) => {
          const m = Math.floor(secs / 60);
          const s = secs % 60;
          return `${m}:${s.toString().padStart(2, "0")}`;
        };
        target = `${formatPace(step.targetValueOne)}-${formatPace(step.targetValueTwo)}/km`;
      } else if (targetType === "heart.rate.zone" && step.targetValueOne) {
        target = `HR Zone ${step.targetValueOne}`;
      } else if (targetType === "power.zone" && step.targetValueOne) {
        target = `Power Zone ${step.targetValueOne}`;
      }

      steps.push({ type, duration, target });
    }
  }

  return {
    name: data.workoutName || "Untitled Workout",
    description: data.description,
    sport: data.sportType?.sportTypeKey || "running",
    steps,
  };
}

interface FitMessages {
  workoutMesgs?: Array<{
    wktName?: string;
    sport?: string | number;
  }>;
  workoutStepMesgs?: Array<{
    intensity?: string | number;
    durationValue?: number;
    durationType?: string | number;
    targetValue?: number;
    targetType?: string | number;
  }>;
}

function parseFitWorkout(
  buffer: ArrayBuffer
): Omit<WorkoutData, "downloadUrl" | "format"> | null {
  try {
    const stream = Stream.fromArrayBuffer(buffer);
    const decoder = new Decoder(stream);
    if (!decoder.isFIT()) return null;

    const { messages } = decoder.read() as { messages: FitMessages };
    const workout = messages.workoutMesgs?.[0];
    const workoutSteps = messages.workoutStepMesgs || [];

    const steps: WorkoutStep[] = workoutSteps.map((step) => {
      const intensity = String(step.intensity || "active").toLowerCase();
      let duration: string | undefined;

      if (step.durationValue) {
        const durationType = String(step.durationType || "").toLowerCase();
        if (durationType.includes("time")) {
          const mins = Math.floor(step.durationValue / 60000);
          const secs = Math.floor((step.durationValue % 60000) / 1000);
          duration = secs
            ? `${mins}:${secs.toString().padStart(2, "0")}`
            : `${mins}:00`;
        } else if (durationType.includes("distance")) {
          duration = `${(step.durationValue / 100000).toFixed(1)} km`;
        }
      }

      return {
        type: intensity,
        duration,
        target: step.targetValue ? `Target: ${step.targetValue}` : undefined,
      };
    });

    return {
      name: workout?.wktName || "Untitled Workout",
      sport: String(workout?.sport || "running").toLowerCase(),
      steps,
    };
  } catch {
    return null;
  }
}

type Props = { params: Promise<{ id: string }> };

export default async function WorkoutPage({ params }: Props) {
  const { id } = await params;
  const found = await findWorkoutBlob(id);

  if (!found) notFound();

  const { blob, format } = found;
  const res = await fetch(blob.url);

  let workout: WorkoutData;

  if (format === "json") {
    const data = (await res.json()) as GarminWorkoutJson;
    const parsed = parseJsonWorkout(data);
    workout = { ...parsed, downloadUrl: blob.url, format };
  } else {
    const buffer = await res.arrayBuffer();
    const parsed = parseFitWorkout(buffer);
    if (!parsed) notFound();
    workout = { ...parsed, downloadUrl: blob.url, format };
  }

  return (
    <main className="max-w-md mx-auto p-6 min-h-screen">
      <Link
        href="/"
        className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-block"
      >
        ← Share your own workout
      </Link>

      <h1 className="text-2xl font-bold mb-1">{workout.name}</h1>
      <p className="text-gray-500 mb-2 capitalize">{workout.sport}</p>
      {workout.description && (
        <p className="text-gray-600 text-sm mb-4">{workout.description}</p>
      )}

      {workout.steps.length > 0 && (
        <div className="space-y-2 mb-6">
          {workout.steps.map((step, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
            >
              <span className="text-xs font-medium uppercase text-gray-500 w-20 shrink-0">
                {step.type}
              </span>
              <div className="flex flex-wrap gap-2 items-center">
                {step.duration && (
                  <span className="font-medium">{step.duration}</span>
                )}
                {step.target && (
                  <span className="text-sm text-blue-600">{step.target}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <a
        href={workout.downloadUrl}
        download={`${workout.name.replace(/\s+/g, "-")}.${workout.format}`}
        className="block w-full text-center bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors"
      >
        Download .{workout.format.toUpperCase()} File
      </a>

      <details className="mt-6 text-sm text-gray-600">
        <summary className="cursor-pointer font-medium hover:text-gray-800">
          How to import into Garmin Connect
        </summary>
        <ol className="mt-2 ml-4 list-decimal space-y-1">
          {workout.format === "json" ? (
            <>
              <li>
                Install the{" "}
                <a
                  href="https://chromewebstore.google.com/detail/share-your-garmin-connect/kdpolhnlnkengkmfncjdbfdehglepmff"
                  className="text-blue-600 underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Share Your Garmin Connect Workout
                </a>{" "}
                extension
              </li>
              <li>Go to Garmin Connect → Training → Workouts</li>
              <li>Click the extension icon → Upload → select downloaded file</li>
            </>
          ) : (
            <>
              <li>Connect your Garmin watch via USB</li>
              <li>
                Copy the .FIT file to{" "}
                <code className="bg-gray-100 px-1 rounded">/GARMIN/NewFiles/</code>
              </li>
              <li>Safely eject and sync your watch</li>
            </>
          )}
        </ol>
      </details>
    </main>
  );
}
