declare module "@garmin/fitsdk" {
  export class Stream {
    static fromArrayBuffer(buffer: ArrayBuffer): Stream;
  }

  export class Decoder {
    constructor(stream: Stream);
    isFIT(): boolean;
    checkIntegrity(): boolean;
    read(): {
      messages: {
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
        sessionMesgs?: Array<{
          sport?: string | number;
          startTime?: number;
          totalDistance?: number;
          totalElapsedTime?: number;
        }>;
        [key: string]: unknown;
      };
      errors: unknown[];
    };
  }

  export class Encoder {
    constructor(stream: Stream);
  }

  export const Profile: unknown;
  export const Utils: unknown;
  export const CrcCalculator: unknown;
}
