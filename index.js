const fs = require('node:fs');
const path = require('node:path');
const {
    Client,
    Collection,
    Events,
    GatewayIntentBits,
    MessageFlags,
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    EmbedBuilder
} = require('discord.js');

const { token, ticketCategoryId, TOSChannelId } = require('./config.json');

// 1. Configura i permessi (Intents) di cosa il bot può "vedere"
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('clientReady', () => {
    console.log(`Bot online! Loggato come ${client.user.tag}`);
});

// ==========================================
// CARICAMENTO DEI COMANDI SLASH (setup.js ecc.)
// ==========================================
client.commands = new Collection();
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);
for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
}

// ==========================================
// GESTIONE EVENTI (Comandi, Bottoni e Modals)
// ==========================================
client.on(Events.InteractionCreate, async (interaction) => {

    // -- ESECUZIONE COMANDI SLASH (es: /setup) --
    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }
        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: 'C\'è stato un errore eseguendo il comando!',
                    flags: MessageFlags.Ephemeral
                });
            } else {
                await interaction.reply({
                    content: 'C\'è stato un errore eseguendo il comando!',
                    flags: MessageFlags.Ephemeral
                });
            }
        }
        return; // Fermiamo qui l'esecuzione se è un comando slash
    }

    if (interaction.isButton() && (interaction.customId === 'ticket_private' || interaction.customId === 'ticket_public')) {
        try {
            await interaction.reply({content: 'Sto creando il tuo ticket... ⏳', flags: MessageFlags.Ephemeral});

            const isPrivate = interaction.customId === 'ticket_private';

            const permissionOverwrites = [
                {
                    id: interaction.guild.id,
                    deny: isPrivate ? [PermissionFlagsBits.ViewChannel] : [],
                    allow: isPrivate ? [] : [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: interaction.user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                }
            ];

            const ticketChannel = await interaction.guild.channels.create({
                name: `ticket-${interaction.user.username}`,
                type: 0,
                parent: ticketCategoryId,
                permissionOverwrites: permissionOverwrites,
            });

            // INVECE DEL BOTTONE, CREIAMO IL MENU A TENDINA
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('service_type_select')
                .setPlaceholder('Seleziona il Service Type per iniziare')
                .addOptions(
                    // Modifica queste opzioni con i servizi reali che offri
                    new StringSelectMenuOptionBuilder().setLabel('Build').setValue('Build').setEmoji('🧱'),
                    new StringSelectMenuOptionBuilder().setLabel('Plugin').setValue('Plugin').setEmoji('🔌'),
                    new StringSelectMenuOptionBuilder().setLabel('Skin').setValue('Skin').setEmoji('👕'),
                    new StringSelectMenuOptionBuilder().setLabel('Multi').setValue('Multi').setEmoji('📦'),
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await ticketChannel.send({
                content: `Benvenuto <@${interaction.user.id}>!\n\nPer favore, seleziona il tipo di servizio che desideri dal menu qui sotto.\n*(Nota: Inviando la richiesta confermi di aver letto e accettato i nostri **TOS** in <#${TOSChannelId}>).*`,
                components: [row]
            });

            await interaction.editReply({content: `Ma sei proprio baka! Vai qui: <#${ticketChannel.id}>`});

        } catch (error) {
            console.error(error);
            if (interaction.deferred || interaction.replied) await interaction.editReply({content: 'Errore durante la creazione del ticket.'});
        }
    }

    // ==========================================
    // 2. APERTURA MODAL DOPO SCELTA MENU
    // ==========================================
    if (interaction.isStringSelectMenu() && interaction.customId === 'service_type_select') {
        const selectedService = interaction.values[0]; // Salviamo il servizio scelto

        // Passiamo il servizio scelto nell'ID del Modal, così non lo perdiamo!
        const modal = new ModalBuilder()
            .setCustomId(`ticket_form_${selectedService}`)
            .setTitle(`Dettagli Progetto (${selectedService})`);

        // Creiamo i 5 campi
        const deadlineInput = new TextInputBuilder()
            .setCustomId('deadline')
            .setLabel("Deadline (Scadenza)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Es. 2 settimane, Entro il 15 Ottobre...")
            .setRequired(true);

        const budgetInput = new TextInputBuilder()
            .setCustomId('budget')
            .setLabel("Budget")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Es. 50€, da concordare...")
            .setRequired(true);

        const descInput = new TextInputBuilder()
            .setCustomId('description')
            .setLabel("Description")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Descrivi nel dettaglio cosa ti serve...")
            .setRequired(true);

        const refInput = new TextInputBuilder()
            .setCustomId('references')
            .setLabel("References (Link a immagini, drive, etc.)")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Inserisci link utili. Potrai allegare file direttamente nel canale dopo!")
            .setRequired(false); // Magari le referenze non le ha sempre

        const infoInput = new TextInputBuilder()
            .setCustomId('additional_info')
            .setLabel("Additional Information")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Altre cose che dovremmo sapere?")
            .setRequired(false);

        // Aggiungiamo i campi al modal (uno per riga)
        modal.addComponents(
            new ActionRowBuilder().addComponents(deadlineInput),
            new ActionRowBuilder().addComponents(budgetInput),
            new ActionRowBuilder().addComponents(descInput),
            new ActionRowBuilder().addComponents(refInput),
            new ActionRowBuilder().addComponents(infoInput)
        );

        await interaction.showModal(modal);
    }

    // ==========================================
    // 3. INVIO MODAL (Lettura dati Form)
    // ==========================================
    // ==========================================
    // 3. INVIO MODAL (Lettura dati Form)
    // ==========================================
    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_form_')) {
        // Estraiamo il tipo di servizio
        const selectedService = interaction.customId.replace('ticket_form_', '');

        // Otteniamo i testi inseriti
        const deadline = interaction.fields.getTextInputValue('deadline');
        const budget = interaction.fields.getTextInputValue('budget');
        const description = interaction.fields.getTextInputValue('description');
        const references = interaction.fields.getTextInputValue('references') || "Nessun link fornito.";
        const additionalInfo = interaction.fields.getTextInputValue('additional_info') || "Nessuna informazione aggiuntiva.";

        // Creiamo l'Embed
        const ticketEmbed = new EmbedBuilder()
            .setColor('#0099ff') // Puoi cambiare il colore esadecimale (es: un bel verde #2ecc71)
            .setTitle('📋 Nuova Richiesta Compilata')
            .setAuthor({
                name: interaction.user.tag,
                iconURL: interaction.user.displayAvatarURL()
            })
            .setDescription(`Dettagli del ticket aperto da <@${interaction.user.id}>.`)
            .addFields(
                { name: '🔹 Service Type', value: selectedService, inline: true },
                { name: '⏳ Deadline', value: deadline, inline: true },
                { name: '💰 Budget', value: budget, inline: true },
                { name: '📝 Description', value: description, inline: false },
                { name: '🔗 References', value: references, inline: false },
                { name: '➕ Additional Info', value: additionalInfo, inline: false }
            )
            .setFooter({ text: '✅ TOS Accettati • Attendi uno staffer' })
            .setTimestamp();

        // Invia l'embed E il messaggio extra per pingare l'utente (l'embed da solo non pinga)
        await interaction.reply({
            content: `<@${interaction.user.id}>, il baka ha risposto! Se hai **file o immagini** (Attachments) da allegare, puoi inviarli direttamente qui in chat ora!`,
            embeds: [ticketEmbed]
        });

        // Rimuoviamo il menu a tendina dal messaggio precedente
        try {
            await interaction.message.edit({components: []});
        } catch (e) {
            console.log("Non sono riuscito a rimuovere il menu, ignoriamo.");
        }
    }
});

// Avvia il bot
client.login(token).catch(errore => {
    console.log("C'è stato un problema durante il login:");
    console.error(errore)
});