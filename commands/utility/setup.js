const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Setup the ticket channel'),
    async execute(interaction) {
        const privateButton = new ButtonBuilder()
            .setCustomId('ticket_private')
            .setLabel('Clicca se sei baka ma sei privato')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔒');

        const publicButton = new ButtonBuilder()
            .setCustomId('ticket_public')
            .setLabel('Clicca se sei baka ma sei pubblico')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🌍');

        const row = new ActionRowBuilder().addComponents(privateButton, publicButton);

        await interaction.channel.send({
            content: 'Clicca il pulsante qui sotto per aprire un ticket!',
            components: [row]
        });

        await interaction.reply({
            content: `Pulsanti creati correttamente!`,
            flags: [MessageFlags.Ephemeral]
        });
    },
};