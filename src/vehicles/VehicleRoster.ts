import { VehicleSpec } from './VehicleSpec';

/** The initial fictional roster. Numbers are tuned for distinct roles, not realism. */
export const VEHICLES: VehicleSpec[] = [
  {
    id: 'vortex_gt', name: 'Vortex GT', price: 12000,
    topSpeedKph: 215, acceleration: 18, handling: 0.75, braking: 30,
    fuelCapacity: 50, fuelBurnRate: 0.09, damageResistance: 1.0, idleRpm: 900, redlineRpm: 7000,
    engineSound: 'engine_v6', cockpitAsset: 'cockpit_vortex_gt', artwork: 'car_vortex_gt',
  },
  {
    id: 'night_hawk', name: 'Night Hawk', price: 24000,
    topSpeedKph: 235, acceleration: 20, handling: 0.85, braking: 32,
    fuelCapacity: 52, fuelBurnRate: 0.095, damageResistance: 1.0, idleRpm: 950, redlineRpm: 7500,
    engineSound: 'engine_i6', cockpitAsset: 'cockpit_night_hawk', artwork: 'car_night_hawk',
  },
  {
    id: 'apex_xr', name: 'Apex XR', price: 38000,
    topSpeedKph: 255, acceleration: 23, handling: 0.95, braking: 35,
    fuelCapacity: 48, fuelBurnRate: 0.1, damageResistance: 0.9, idleRpm: 1000, redlineRpm: 8200,
    engineSound: 'engine_flat6', cockpitAsset: 'cockpit_apex_xr', artwork: 'car_apex_xr',
  },
  {
    id: 'thunder_v8', name: 'Thunder V8', price: 45000,
    topSpeedKph: 265, acceleration: 27, handling: 0.62, braking: 30,
    fuelCapacity: 75, fuelBurnRate: 0.14, damageResistance: 1.3, idleRpm: 800, redlineRpm: 6200,
    engineSound: 'engine_v8', cockpitAsset: 'cockpit_thunder_v8', artwork: 'car_thunder_v8',
  },
  {
    id: 'silverline_turbo', name: 'Silverline Turbo', price: 62000,
    topSpeedKph: 285, acceleration: 25, handling: 0.85, braking: 37,
    fuelCapacity: 60, fuelBurnRate: 0.11, damageResistance: 1.0, idleRpm: 950, redlineRpm: 7800,
    engineSound: 'engine_turbo4', cockpitAsset: 'cockpit_silverline_turbo', artwork: 'car_silverline_turbo',
  },
  {
    id: 'phantom_x', name: 'Phantom X', price: 95000,
    topSpeedKph: 310, acceleration: 25, handling: 1.0, braking: 42,
    fuelCapacity: 65, fuelBurnRate: 0.13, damageResistance: 0.8, idleRpm: 1000, redlineRpm: 9000,
    engineSound: 'engine_v12', cockpitAsset: 'cockpit_phantom_x', artwork: 'car_phantom_x',
  },
];

export const getVehicle = (id: string): VehicleSpec => VEHICLES.find((v) => v.id === id) ?? VEHICLES[0];
