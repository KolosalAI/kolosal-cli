/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';

export const WITTY_LOADING_PHRASES = [
  "Running npm install (pray for me)...",
  "Shipping features straight to prod (YOLO)...",
  "Fixing semicolons one pixel at a time...",
  "Mapping through undefined...",
  "Consulting Stack Overflow shamans...",
  "Brewing fresh JavaScript... now decaffeinated.",
  "Don’t rush—compilers hate that...",
  "Counting closing brackets...",
  "Searching for the missing semicolon...",
  "Lubricating the build pipeline...",
  "It’s not a bug, it’s legacy behavior...",
  "Have you tried turning Git off and on again?",
  "Flipping the USB cable again...",
  "Rewriting in Rust because reasons...",
  "Trying to quit Vim... still trying...",
  "Commiting crimes against CSS...",
  "Pushing to prod without tests...",
  "Running make me_a_sandwich... permission denied.",
  "Unit testing... my patience.",
  "Segfaulting in style...",
  "Training on your vibes… gradient descent in progress...",
  "Fine-tuning my sarcasm layer...",
  "Hallucinating a witty response...",
  "Adjusting the bias... and variance...",
  "Checking GPU temps... too hot for this joke.",
  "My other process is still in training...",
  "Calibrating humor model... loss not converging.",
  "Fetching embeddings from the meme database...",
  "Prompt engineering my way out of this...",
  "Hallucinated an answer… looks legit.",
  "Running out of tokens... insert coin to continue...",
  "Quantizing my jokes to 4-bit...",
  "Waiting for the attention layer to notice you...",
  "Beam search for the funniest response...",
  "Distilling humor from a larger comedian...",
  "Aligning with human preference... please clap.",
  "Overfitting to your sense of humor...",
  "Running RLHF: Reinforcement Learning from Hilarious Feedback...",
  "Sampling with temperature=1.5... things may get weird.",
  "Top-k filtering my punchlines...",
  "Applying dropout... on unfunny jokes.",
  "Sharding my personality across GPUs...",
  "Loading weights... mostly dad jokes.",
  "Debugging hallucinations... or am I?",
  "Self-supervised laughter incoming...",
  "My loss is still high, but my vibes are immaculate.",
  "Caching embeddings... mostly cat memes.",
  "Running out of VRAM... moving wit to CPU...",
  "Evaluating perplexity of this punchline...",
  "Error 429: Too Many Laughs.",
  "Loading LLM humor... may contain hallucinations.",
  "Blowing on the GPU cartridge...",
  "Loading... while(1) { barrelRoll(); }",
  "Respawning humor.exe...",
  "Waiting for respawn()... still loading.",
  "The cake is still a 404...",
  "Doing the Kessel Run in 12 queries...",
  "Mining Bitcoin... kidding (or am I?)",
  "Petting the AI hamsters running my clusters...",
  "Unlocking hidden achievements...",
  "Finding loot in stacktrace.txt...",
  "Cross-validating my punchlines...",
  "Performing zero-shot humor transfer...",
  "Gradient exploding… like my deadlines.",
  "Hallucinating stack traces...",
  "Parameter-efficient jokes loading...",
  "Checking alignment… nope, still chaotic.",
  "Deploying sarcasm model to production...",
  "Evaluating inference speed of this joke...",
  "Pre-training on 4chan… oh no.",
  "Warming up transformers... not the robots.",
  "Waiting for the context window to remember this...",
  "Oops, truncated at 8k tokens...",
  "Running on vibes per second...",
  "Batching laughs with inflight chuckles...",
  "My GPU ran out of VRAM, switching to human RAM...",
  "Too many epochs, not enough coffee.",
  "Reinforcing humor until convergence...",
  "Scaling wit horizontally... but my brain is single-threaded.",
  "Just hallucinated a stack trace for your soul...",
];

export const PHRASE_CHANGE_INTERVAL_MS = 15000;

/**
 * Custom hook to manage cycling through loading phrases.
 * @param isActive Whether the phrase cycling should be active.
 * @param isWaiting Whether to show a specific waiting phrase.
 * @returns The current loading phrase.
 */
export const usePhraseCycler = (isActive: boolean, isWaiting: boolean) => {
  const [currentLoadingPhrase, setCurrentLoadingPhrase] = useState(
    WITTY_LOADING_PHRASES[0],
  );
  const phraseIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isWaiting) {
      setCurrentLoadingPhrase('Waiting for user confirmation...');
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
        phraseIntervalRef.current = null;
      }
    } else if (isActive) {
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
      }
      // Select an initial random phrase
      const initialRandomIndex = Math.floor(
        Math.random() * WITTY_LOADING_PHRASES.length,
      );
      setCurrentLoadingPhrase(WITTY_LOADING_PHRASES[initialRandomIndex]);

      phraseIntervalRef.current = setInterval(() => {
        // Select a new random phrase
        const randomIndex = Math.floor(
          Math.random() * WITTY_LOADING_PHRASES.length,
        );
        setCurrentLoadingPhrase(WITTY_LOADING_PHRASES[randomIndex]);
      }, PHRASE_CHANGE_INTERVAL_MS);
    } else {
      // Idle or other states, clear the phrase interval
      // and reset to the first phrase for next active state.
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
        phraseIntervalRef.current = null;
      }
      setCurrentLoadingPhrase(WITTY_LOADING_PHRASES[0]);
    }

    return () => {
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
        phraseIntervalRef.current = null;
      }
    };
  }, [isActive, isWaiting]);

  return currentLoadingPhrase;
};
