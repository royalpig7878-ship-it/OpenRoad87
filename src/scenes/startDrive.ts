import Phaser from 'phaser';
import { SceneKeys } from '../core/config';
import { ensureCockpitAssets } from '../UI/CockpitView';
import { getVehicle } from '../vehicles/VehicleRoster';

/** Extra options for starting a drive: an arcade challenge and the environment to run it in. */
export interface DriveOptions {
  challengeId?: string;
  /** A career job (its rules replace `challengeId`). */
  jobId?: string;
  envId?: string;
}

/**
 * Starts the drive scene for a vehicle, loading that car's cockpit art first if it is not loaded yet
 * (only the default car's cockpit is preloaded).
 */
export async function startDrive(scene: Phaser.Scene, vehicleId: string, fromGarage: boolean, options: DriveOptions = {}): Promise<void> {
  await ensureCockpitAssets(scene, getVehicle(vehicleId));
  scene.scene.start(SceneKeys.RoadTest, { fromGarage, ...options });
}
