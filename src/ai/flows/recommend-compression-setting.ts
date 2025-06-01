'use server';

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const RecommendCompressionSettingInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo to be compressed, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type RecommendCompressionSettingInput = z.infer<typeof RecommendCompressionSettingInputSchema>;

const RecommendCompressionSettingOutputSchema = z.object({
  targetSizePercentage: z
    .number()
    .describe("The recommended target file size percentage (e.g., 70 for 70% of original size, 1-100) that balances quality and file size reduction. Aim for near 100 for lossless if appropriate for the image type (e.g. PNG)."),
  reasoning: z.string().describe('The reasoning behind the target size percentage recommendation.'),
});
export type RecommendCompressionSettingOutput = z.infer<typeof RecommendCompressionSettingOutputSchema>;

export async function recommendCompressionSetting(input: RecommendCompressionSettingInput): Promise<RecommendCompressionSettingOutput> {
  return recommendCompressionSettingFlow(input);
}

const prompt = ai.definePrompt({
  name: 'recommendCompressionSettingPrompt',
  input: {schema: RecommendCompressionSettingInputSchema},
  output: {schema: RecommendCompressionSettingOutputSchema},
  prompt: `You are an expert image compression specialist. Given the image below, recommend an optimal target file size percentage.
This percentage (1-100, inclusive) represents the desired size of the compressed image relative to the original.
For example, 70 means the compressed image should aim to be 70% of the original file's byte size.
A value of 100 implies aiming for the best possible quality, which might be lossless for formats like PNG.
Consider the image content (e.g., photo, graphic, text) to balance quality and file size reduction effectively.
Provide the reasoning for your recommendation.

Respond using JSON format.

Image: {{media url=photoDataUri}}`,
});

const recommendCompressionSettingFlow = ai.defineFlow(
  {
    name: 'recommendCompressionSettingFlow',
    inputSchema: RecommendCompressionSettingInputSchema,
    outputSchema: RecommendCompressionSettingOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
