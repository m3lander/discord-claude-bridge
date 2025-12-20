/**
 * Slash Command Definitions
 *
 * Defines all slash commands using SlashCommandBuilder.
 * These are registered with Discord at bot startup.
 */

import { SlashCommandBuilder } from 'discord.js';

export const modelCommand = new SlashCommandBuilder()
  .setName('model')
  .setDescription('Change the AI model for this thread session')
  .addStringOption(option =>
    option
      .setName('model')
      .setDescription('The model to use')
      .setRequired(true)
      .addChoices(
        { name: 'Sonnet (Default)', value: 'sonnet' },
        { name: 'Opus (Complex tasks)', value: 'opus' },
        { name: 'Haiku (Fast)', value: 'haiku' },
      )
  );

export const clearCommand = new SlashCommandBuilder()
  .setName('clear')
  .setDescription('Clear the current session and start fresh');

export const resumeCommand = new SlashCommandBuilder()
  .setName('resume')
  .setDescription('Resume a previous session')
  .addIntegerOption(option =>
    option
      .setName('limit')
      .setDescription('Number of recent sessions to show (default: 10)')
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(25)
  );

export const allCommands = [
  modelCommand,
  clearCommand,
  resumeCommand,
];
