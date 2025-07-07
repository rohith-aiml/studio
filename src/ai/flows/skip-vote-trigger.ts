'use server';

/**
 * @fileOverview An AI agent that determines if the drawer is scribbling randomly and allows players to initiate a skip vote.
 *
 * - analyzeDrawingHistory - A function that analyzes the drawing history and determines if a skip vote should be initiated.
 * - AnalyzeDrawingHistoryInput - The input type for the analyzeDrawingHistory function.
 * - AnalyzeDrawingHistoryOutput - The return type for the analyzeDrawingHistory function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AnalyzeDrawingHistoryInputSchema = z.object({
  drawingHistory: z
    .string()
    .describe(
      'A string representing the history of drawings made by the current drawer.'
    ),
  targetWord: z.string().describe('The word the drawer is supposed to be drawing.'),
});
export type AnalyzeDrawingHistoryInput = z.infer<
  typeof AnalyzeDrawingHistoryInputSchema
>;

const AnalyzeDrawingHistoryOutputSchema = z.object({
  shouldInitiateSkipVote: z
    .boolean()
    .describe(
      'Whether or not a skip vote should be initiated based on the drawing history.'
    ),
  reason: z.string().describe('The reason for the skip vote recommendation.'),
});
export type AnalyzeDrawingHistoryOutput = z.infer<
  typeof AnalyzeDrawingHistoryOutputSchema
>;

export async function analyzeDrawingHistory(
  input: AnalyzeDrawingHistoryInput
): Promise<AnalyzeDrawingHistoryOutput> {
  return analyzeDrawingHistoryFlow(input);
}

const prompt = ai.definePrompt({
  name: 'analyzeDrawingHistoryPrompt',
  input: {schema: AnalyzeDrawingHistoryInputSchema},
  output: {schema: AnalyzeDrawingHistoryOutputSchema},
  prompt: `You are an AI game moderator for a drawing game.

You are responsible for analyzing the drawing history of a player and determining if they are actually trying to draw the target word or just scribbling randomly. If the drawing history suggests the player is not making an effort to draw the word, you should recommend initiating a skip vote so that the game can continue without wasting time.

Here is the drawing history:
{{{drawingHistory}}}

Here is the target word:
{{{targetWord}}}

Based on this information, determine whether a skip vote should be initiated.

Output your decision in JSON format using the following schema:
${AnalyzeDrawingHistoryOutputSchema.description}`,
});

const analyzeDrawingHistoryFlow = ai.defineFlow(
  {
    name: 'analyzeDrawingHistoryFlow',
    inputSchema: AnalyzeDrawingHistoryInputSchema,
    outputSchema: AnalyzeDrawingHistoryOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
