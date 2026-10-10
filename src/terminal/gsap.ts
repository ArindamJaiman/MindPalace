import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, ScrambleTextPlugin, ScrollToPlugin, useGSAP);

export { gsap, ScrollTrigger, useGSAP };

export const SCRAMBLE_CHARS = '01<>/|[]{}#$%&*+=-_?!';

/** Reduced motion: the OS setting or the in-app toggle. */
export function prefersReduced(reduceSetting: boolean): boolean {
  return reduceSetting || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
