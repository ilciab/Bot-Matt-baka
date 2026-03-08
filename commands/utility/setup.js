const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const fs = require('fs');
const {ticketChannelId} = require('../../config.json');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Setup the ticket channel'),
    async execute(interaction) {
        // 1. Definiamo il pulsante
        const privateButton = new ButtonBuilder()
            .setCustomId('ticket_open')
            .setLabel('Clicca se sei baka ma sei privato')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📩');

        const publicButton = new ButtonBuilder()
            .setCustomId('ticket_open')
            .setLabel('Clicca se sei baka ma sei pubblico')
            .setStyle(ButtonStyle.Success)
            .setEmoji('📩');

        const row = new ActionRowBuilder().addComponents(privateButton,publicButton);

        // 3. Inviamo il messaggio nel canale dei ticket
        await interaction.channel.send({
            content: 'Clicca il pulsante qui sotto per aprire un ticket!',
            components: [row]
        });

        // 4. Risposta di conferma (obbligatoria per Discord)
        await interaction.reply({
            content: `Pulsante creato correttamente!`,
            flags: [MessageFlags.Ephemeral]
        });
    },
};