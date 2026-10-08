export interface ShotDef {
  id: string;
  label: string;
  hint: string;
  /** Exterior shots get cut out and staged; interiors are enhanced only. */
  exterior: boolean;
  /** Plate is normally visible in this view. */
  plate: boolean;
}

// Standard listing order. Classifieds use the first photo as the hero, so front 3/4 leads.
export const SHOTS: ShotDef[] = [
  { id: "front-34", label: "Front 3/4", hint: "Front corner, about 45°. Camera at headlight height, whole car in frame with a little space around it.", exterior: true, plate: true },
  { id: "side", label: "Side profile", hint: "Square to the middle of the car, camera at door-handle height. Wheels straight.", exterior: true, plate: false },
  { id: "rear-34", label: "Rear 3/4", hint: "Opposite rear corner, about 45°, tail-light height.", exterior: true, plate: true },
  { id: "rear", label: "Rear", hint: "Dead centre behind the car, tail-light height.", exterior: true, plate: true },
  { id: "front", label: "Front", hint: "Dead centre in front, headlight height.", exterior: true, plate: true },
  { id: "other-side", label: "Other side", hint: "Square to the other side.", exterior: true, plate: false },
  { id: "dash", label: "Dashboard", hint: "From the back seat between the front seats, or the open driver's door. Ignition on.", exterior: false, plate: false },
  { id: "odometer", label: "Odometer", hint: "Ignition on, fill the frame with the cluster. Avoid glare.", exterior: false, plate: false },
  { id: "front-seats", label: "Front seats", hint: "Driver's door open, shoot across both seats.", exterior: false, plate: false },
  { id: "rear-seats", label: "Rear seats", hint: "Rear door open, shoot across.", exterior: false, plate: false },
  { id: "boot", label: "Boot", hint: "Boot open, from behind at chest height.", exterior: false, plate: false },
  { id: "wheel", label: "Wheel", hint: "Front wheel, logo upright, fill the frame.", exterior: false, plate: false },
  { id: "engine", label: "Engine bay", hint: "Bonnet up, from the front at chest height.", exterior: false, plate: false },
  { id: "tray", label: "Tray / tub", hint: "Utes and cab chassis: from behind and above, tailgate down.", exterior: false, plate: false },
  { id: "infotainment", label: "Infotainment", hint: "Screen on, straight on, no glare.", exterior: false, plate: false },
  { id: "steering", label: "Steering wheel", hint: "From the driver's door, wheel and controls in frame.", exterior: false, plate: false },
  { id: "third-row", label: "Third row", hint: "Seven-seaters: rear door or tailgate open.", exterior: false, plate: false },
  { id: "rear-wheel", label: "Rear wheel", hint: "Rear wheel, fill the frame.", exterior: false, plate: false },
  { id: "spare", label: "Spare wheel", hint: "Spare and tools, boot floor up.", exterior: false, plate: false },
  { id: "keys", label: "Keys", hint: "All keys on a plain surface.", exterior: false, plate: false },
  { id: "books", label: "Service books", hint: "Books open at the last service stamp.", exterior: false, plate: false },
];

/** Square-on shots where the wheels should sit level in the frame. */
export const LEVEL_SHOTS = new Set(["side", "other-side", "front", "rear"]);

export const shotDef = (id: string) => SHOTS.find((s) => s.id === id);
export const shotLabel = (id: string) => shotDef(id)?.label ?? "Extra";
