/** The game shows speed in mph (the dial and the road signs are mph); physics and police run in km/h. */
export const KPH_PER_MPH = 1.609344;
export const kphToMph = (kph: number): number => kph / KPH_PER_MPH;
export const mphToKph = (mph: number): number => mph * KPH_PER_MPH;
