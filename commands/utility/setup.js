const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const fs = require('fs');
const {ticketChannelId} = require('../../config.json');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Setup the ticket channel'),
    async execute(interaction) {
        // 1. Definiamo il pulsante
        const button = new ButtonBuilder()
            .setCustomId('ticket_open')
            .setLabel('Clicca se sei baka')
            .setStyle(ButtonStyle.Success)
            .setEmoji('📩');

        const row = new ActionRowBuilder().addComponents(button);

        // 2. Prendiamo il canale dal server usando l'ID del JSON
        const targetChannel = await interaction.guild.channels.fetch(ticketChannelId);

        // 3. Inviamo il messaggio nel canale dei ticket
        await targetChannel.send({
            content: 'Clicca il pulsante qui sotto per aprire un ticket!',
            components: [row]
        });

        // 4. Risposta di conferma (obbligatoria per Discord)
        await interaction.reply({
            content: `Pulsante inviato correttamente in <#${ticketChannelId}>`,
            flags: [MessageFlags.Ephemeral]
        });
    },
};