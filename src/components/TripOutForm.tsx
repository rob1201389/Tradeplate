"use client";

import { useActionState } from "react";
import { startTrip, type ActionState } from "@/app/actions";
import SignaturePad from "./SignaturePad";
import CollectionNotice from "./CollectionNotice";
import { DateTimeField, FormError, Select, Submit, Text } from "./form";

const PURPOSES = [
  "Delivery to customer",
  "Collection / pick-up",
  "Demonstration / test drive",
  "Road test after service",
  "To or from repairer",
  "To or from auction",
  "Inspection / blue slip",
  "Transfer between yards",
  "Other",
];

export default function TripOutForm({
  plates,
  lockedPlate,
  defaultOutAt,
  defaultBatch,
  orgName,
  retentionYears,
}: {
  plates: string[];
  lockedPlate?: string;
  defaultOutAt: string;
  defaultBatch?: string;
  orgName: string;
  retentionYears: number;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    startTrip,
    null,
  );
  const e = state?.errors ?? {};

  return (
    <form action={action} className="space-y-5">
      <FormError message={state?.message} />

      {lockedPlate ? (
        <input type="hidden" name="plateNumber" value={lockedPlate} />
      ) : (
        <Select
          name="plateNumber"
          label="Plate number"
          placeholder="Select a plate"
          options={plates.map((p) => ({ value: p, label: p }))}
          error={e.plateNumber}
          required
        />
      )}

      <DateTimeField
        name="outAt"
        label="Date and time out"
        defaultValue={defaultOutAt}
        error={e.outAt}
      />

      <Text
        name="batchNumber"
        label="Batch number"
        defaultValue={defaultBatch}
        error={e.batchNumber}
        required
        autoCapitalize="characters"
        placeholder="e.g. B-2261"
      />

      <Text
        name="vehicleMake"
        label="Vehicle make"
        error={e.vehicleMake}
        required
        placeholder="e.g. Toyota Hilux"
      />

      <Text
        name="vehicleRego"
        label="Vehicle rego or VIN"
        hint="Optional, but worth recording"
        error={e.vehicleRego}
        autoCapitalize="characters"
      />

      <Text
        name="tripDestination"
        label="Trip destination"
        error={e.tripDestination}
        required
        placeholder="e.g. Penrith, then Blacktown"
      />

      <Select
        name="purpose"
        label="Purpose of use"
        placeholder="Select a purpose"
        options={PURPOSES.map((p) => ({ value: p, label: p }))}
        error={e.purpose}
      />

      <Text
        name="driverName"
        label="Driver's name"
        error={e.driverName}
        required
        placeholder="Full name"
      />

      <Text
        name="driverLicence"
        label="Driver's licence number"
        hint="Optional"
        error={e.driverLicence}
        autoCapitalize="characters"
      />

      <CollectionNotice orgName={orgName} retentionYears={retentionYears} />

      <SignaturePad
        name="signatureOut"
        label="Driver's signature"
        hint="Sign to confirm you have taken the plate"
      />
      {e.signatureOut && (
        <p className="-mt-3 text-xs font-medium text-red-600">
          {e.signatureOut}
        </p>
      )}

      <Submit>Sign plate out</Submit>
    </form>
  );
}
