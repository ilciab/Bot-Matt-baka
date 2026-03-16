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
    EmbedBuilder,
    ButtonBuilder, // AGGIUNTO
    ButtonStyle    // AGGIUNTO
} = require('discord.js');

const { token, ticketCategoryId, TOSChannelId } = require('./config.json');

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
// CARICAMENTO DEI COMANDI SLASH
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

    // -- ESECUZIONE COMANDI SLASH --
    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;
        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            const errorOptions = { content: 'C\'è stato un errore eseguendo il comando!', flags: MessageFlags.Ephemeral };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorOptions);
            } else {
                await interaction.reply(errorOptions);
            }
        }
        return;
    }

    // -- CREAZIONE TICKET --
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

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('service_type_select')
                .setPlaceholder('Seleziona il Service Type per iniziare')
                .addOptions(
                    new StringSelectMenuOptionBuilder().setLabel('Build').setValue('Build').setEmoji('🧱'),
                    new StringSelectMenuOptionBuilder().setLabel('Plugin').setValue('Plugin').setEmoji('🔌'),
                    new StringSelectMenuOptionBuilder().setLabel('Skin').setValue('Skin').setEmoji('👕'),
                    new StringSelectMenuOptionBuilder().setLabel('Model').setValue('Model').setEmoji('🗿'), // <-- NUOVO SERVIZIO AGGIUNTO
                    new StringSelectMenuOptionBuilder().setLabel('Multi').setValue('Multi').setEmoji('📦'),
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await ticketChannel.send({
                content: `Benvenuto <@${interaction.user.id}>!\n\nPer favore, seleziona il tipo di servizio che desideri dal menu qui sotto.\n*(Nota: Inviando la richiesta confermi di aver letto e accettato i nostri **TOS** in <#${TOSChannelId}>).*`,
                components: [row]
            });

            await interaction.editReply({content: `Ticket creato! Vai qui: <#${ticketChannel.id}>`});

        } catch (error) {
            console.error(error);
            if (interaction.deferred || interaction.replied) await interaction.editReply({content: 'Errore durante la creazione del ticket.'});
        }
    }

    // ==========================================
    // 1. APERTURA COMMON MODAL DOPO SCELTA MENU
    // ==========================================
    if (interaction.isStringSelectMenu() && interaction.customId === 'service_type_select') {
        const selectedService = interaction.values[0];

        const commonModal = new ModalBuilder()
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

        commonModal.addComponents(
            new ActionRowBuilder().addComponents(deadlineInput),
            new ActionRowBuilder().addComponents(budgetInput),
            new ActionRowBuilder().addComponents(descInput),
            new ActionRowBuilder().addComponents(refInput),
        );

        await interaction.showModal(commonModal);

        // Rimuoviamo il menu a tendina
        try {
            await interaction.message.edit({components: []});
        } catch (e) {
            console.log("Non sono riuscito a rimuovere il menu.");
        }
    }

    // ==========================================
    // 2. INVIO COMMON MODAL & CREAZIONE BOTTONE
    // ==========================================
    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_form_')) {
        const selectedService = interaction.customId.replace('ticket_form_', '');

        const deadline = interaction.fields.getTextInputValue('deadline');
        const budget = interaction.fields.getTextInputValue('budget');
        const description = interaction.fields.getTextInputValue('description');
        const references = interaction.fields.getTextInputValue('references') || "Nessun link fornito.";

        const ticketEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('📋 Nuova Richiesta Iniziale')
            .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
            .setDescription(`Dettagli base del ticket aperto da <@${interaction.user.id}>.`)
            .addFields(
                { name: '🔹 Service Type', value: selectedService, inline: true },
                { name: '⏳ Deadline', value: deadline, inline: true },
                { name: '💰 Budget', value: budget, inline: true },
                { name: '📝 Description', value: description, inline: false },
                { name: '🔗 References', value: references, inline: false }
                // Rimosso additionalInfo per evitare il crash!
            )
            .setTimestamp();

        // Inviamo l'embed base nel canale
        await interaction.channel.send({ embeds: [ticketEmbed] });

        // Creiamo il bottone per lo step successivo.
        // Se è Plugin o Multi, magari non serve un modal extra, ma gestiamo la logica dopo.
        const nextStepButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`open_specific_modal_${selectedService}`)
                .setLabel(`Continua con i dettagli per ${selectedService}`)
                .setStyle(ButtonStyle.Success)
        );

        await interaction.reply({
            content: `Ottimo lavoro <@${interaction.user.id}>! Prima parte completata. Clicca qui sotto per gli ultimi dettagli specifici per **${selectedService}**.`,
            components: [nextStepButton],
            flags: MessageFlags.Ephemeral // Solo l'utente vede questo bottone
        });
    }

    // ==========================================
    // 3. CLICK SUL BOTTONE: APERTURA MODAL SPECIFICO
    // ==========================================
    if (interaction.isButton() && interaction.customId.startsWith('open_specific_modal_')) {
        const selectedService = interaction.customId.replace('open_specific_modal_', '');

        let specificModal;
        if (selectedService === 'Build') {
            specificModal = new ModalBuilder()
                .setCustomId('specific_modal_Build')
                .setTitle('Build Specific Details'); // Tradotto in inglese

            // 1. Size
            const sizeInput = new TextInputBuilder()
                .setCustomId('build_size')
                .setLabel("Size (e.g., 100x100, 250x250)")
                .setPlaceholder("Enter the dimensions of the build...")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            // 2. Elements to include
            const elementsInput = new TextInputBuilder()
                .setCustomId('build_elements')
                .setLabel("Elements to include")
                .setPlaceholder("Houses, terrain, trees, specific structures...")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            // 3. Version
            const versionInput = new TextInputBuilder()
                .setCustomId('build_version')
                .setLabel("Minecraft Version")
                .setPlaceholder("e.g., 1.20.4, 1.8.9, Bedrock...")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            // 4. Delivery Format
            const formatInput = new TextInputBuilder()
                .setCustomId('build_format')
                .setLabel("Delivery Format")
                .setPlaceholder("e.g., .schematic, .litematic, World folder...")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            // 5. Additional Information
            const infoInput = new TextInputBuilder()
                .setCustomId('build_additional_info')
                .setLabel("Additional Information")
                .setPlaceholder("Any extra details we should know?")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false); // Impostato su false perché opzionale

            // Aggiungiamo i 5 campi al modal (ricorda: Discord supporta MAX 5 ActionRow per Modal)
            specificModal.addComponents(
                new ActionRowBuilder().addComponents(sizeInput),
                new ActionRowBuilder().addComponents(elementsInput),
                new ActionRowBuilder().addComponents(versionInput),
                new ActionRowBuilder().addComponents(formatInput),
                new ActionRowBuilder().addComponents(infoInput)
            );
        } else if (selectedService === 'Skin') {
            specificModal = new ModalBuilder()
                .setCustomId('specific_modal_Skin')
                .setTitle('Skin Specific Details');

            // 1. Skin Size (Steve/Alex)
            const sizeInput = new TextInputBuilder()
                .setCustomId('skin_size')
                .setLabel("Skin Size (Steve or Alex?)")
                .setPlaceholder("Steve (Classic 4px arms) or Alex (Slim 3px arms)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            // 2. Additional Information
            const infoInput = new TextInputBuilder()
                .setCustomId('skin_additional_info')
                .setLabel("Additional Information")
                .setPlaceholder("Any extra details, accessories, or specific features?")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false); // Opzionale

            // Aggiungiamo i componenti al modal
            specificModal.addComponents(
                new ActionRowBuilder().addComponents(sizeInput),
                new ActionRowBuilder().addComponents(infoInput)
            );
        } else if (selectedService === 'Model') {
            specificModal = new ModalBuilder()
                .setCustomId('specific_modal_Model')
                .setTitle('Model Specific Details'); // Tradotto in inglese

            // 1. Texture Resolution
            const textureInput = new TextInputBuilder()
                .setCustomId('model_texture')
                .setLabel("Texture Resolution")
                .setPlaceholder("e.g., 16x16, 32x32, 128x128...")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            // 2. Animations
            const animationInput = new TextInputBuilder()
                .setCustomId('model_animations')
                .setLabel("Do you need any animations?")
                .setPlaceholder("e.g., Idle, walking, attack, or None")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            // 3. Version
            const versionInput = new TextInputBuilder()
                .setCustomId('model_version')
                .setLabel("Minecraft Version")
                .setPlaceholder("e.g., 1.20.4, 1.19.2, Bedrock...")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            // 4. Implementation Method
            const implementationInput = new TextInputBuilder()
                .setCustomId('model_implementation')
                .setLabel("How should we implement the model?")
                .setPlaceholder("e.g., ItemsAdder, Oraxen, Vanilla Resource Pack...")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            // 5. Additional Information
            const infoInput = new TextInputBuilder()
                .setCustomId('model_additional_info')
                .setLabel("Additional Information")
                .setPlaceholder("Any extra details or specific requirements?")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false); // Opzionale

            // Aggiungiamo i 5 campi al modal (limite massimo raggiunto!)
            specificModal.addComponents(
                new ActionRowBuilder().addComponents(textureInput),
                new ActionRowBuilder().addComponents(animationInput),
                new ActionRowBuilder().addComponents(versionInput),
                new ActionRowBuilder().addComponents(implementationInput),
                new ActionRowBuilder().addComponents(infoInput)
            );
        } else {
            // Selezioni come "Plugin" o "Multi" che non hanno un modal specifico
            return interaction.reply({
                content: "✅ Questo servizio non richiede ulteriori dettagli. Un membro dello staff ti risponderà a breve!",
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.showModal(specificModal);
    }

    // ==========================================
    // 4. INVIO MODAL SPECIFICO (Build, Skin, Model)
    // ==========================================
    if (interaction.isModalSubmit() && interaction.customId.startsWith('specific_modal_')) {
        const selectedService = interaction.customId.replace('specific_modal_', '');

        // 1. CREIAMO L'EMBED PRIMA DI TUTTO!
        const extraEmbed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle(`✅ Dettagli Aggiuntivi: ${selectedService}`)
            .setFooter({ text: 'Tutti i dati sono stati raccolti con successo.' });

        // 2. ORA possiamo aggiungere i campi in base al servizio
        if (selectedService === 'Build') {
            extraEmbed.addFields(
                { name: '📏 Size', value: interaction.fields.getTextInputValue('build_size'), inline: true },
                { name: '📦 Version', value: interaction.fields.getTextInputValue('build_version'), inline: true },
                { name: '💾 Format', value: interaction.fields.getTextInputValue('build_format'), inline: true },
                { name: '🧱 Elements', value: interaction.fields.getTextInputValue('build_elements'), inline: false },
                { name: '➕ Additional Info', value: interaction.fields.getTextInputValue('build_additional_info') || "Nessuna.", inline: false }
            );
        } else if (selectedService === 'Skin') {
            extraEmbed.addFields(
                { name: '📏 Skin Size', value: interaction.fields.getTextInputValue('skin_size'), inline: true },
                { name: '➕ Additional Info', value: interaction.fields.getTextInputValue('skin_additional_info') || "Nessuna.", inline: false }
            );
        } else if (selectedService === 'Model') {
            extraEmbed.addFields(
                { name: '🎨 Texture Res', value: interaction.fields.getTextInputValue('model_texture'), inline: true },
                { name: '🎬 Animations', value: interaction.fields.getTextInputValue('model_animations'), inline: true },
                { name: '📦 Version', value: interaction.fields.getTextInputValue('model_version'), inline: true },
                { name: '⚙️ Implementation', value: interaction.fields.getTextInputValue('model_implementation'), inline: false },
                { name: '➕ Additional Info', value: interaction.fields.getTextInputValue('model_additional_info') || "Nessuna.", inline: false }
            );
        }

        // 3. Inviamo l'embed completo nel canale
        await interaction.channel.send({ embeds: [extraEmbed] });

        // 4. Rispondiamo all'utente confermando la fine della procedura
        await interaction.reply({
            content: `Perfetto! Abbiamo raccolto tutti i dati. Uno staffer prenderà in carico il tuo ticket a breve.`,
            flags: MessageFlags.Ephemeral
        });

        // 5. Opzionale: disabilitiamo il bottone temporaneo del messaggio precedente
        try {
            await interaction.message.edit({ components: [] });
        } catch (e) {
            console.log("Impossibile rimuovere il bottone, probabile messaggio epimero.");
        }
    }
});

client.login(token).catch(errore => {
    console.log("C'è stato un problema durante il login:");
    console.error(errore)
});