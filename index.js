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
    ButtonBuilder,
    ButtonStyle
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
    console.log(`Bot online! Logged as ${client.user.tag}`);
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
            const errorOptions = { content: 'An error occurred while executing the command!', flags: MessageFlags.Ephemeral };
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
            await interaction.reply({content: 'Creating your ticket... ⏳', flags: MessageFlags.Ephemeral});

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
                    new StringSelectMenuOptionBuilder().setLabel('Model').setValue('Model').setEmoji('🗿'),
                    new StringSelectMenuOptionBuilder().setLabel('Other').setValue('Other').setEmoji('📦'),
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await ticketChannel.send({
                content: `Welcome <@${interaction.user.id}>!\n\nPlease select the type of service you need from the menu below.\n*(Note: By submitting this request, you confirm that you have read and accepted our **TOS** in <#${TOSChannelId}>).*`,
                components: [row]
            });

            await interaction.editReply({content: `Your ticket has been created! You can find it here: <#${ticketChannel.id}>`});

        } catch (error) {
            console.error(error);
            if (interaction.deferred || interaction.replied) await interaction.editReply({content: 'An error occurred while creating the ticket.'});
        }
    }

    // ==========================================
    // 1. APERTURA COMMON MODAL DOPO SCELTA MENU
    // ==========================================
    if (interaction.isStringSelectMenu() && interaction.customId === 'service_type_select') {
        const selectedService = interaction.values[0];

        const commonModal = new ModalBuilder()
            .setCustomId(`ticket_form_${selectedService}`)
            .setTitle(`Project Details (${selectedService})`);

        const deadlineInput = new TextInputBuilder()
            .setCustomId('deadline')
            .setLabel("Deadline")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("E.g. 2 weeks, By October 15th, no strict deadline, etc.")
            .setRequired(true);

        const budgetInput = new TextInputBuilder()
            .setCustomId('budget')
            .setLabel("Budget")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("E.g. 50€, around 30€, not sure yet, flexible, etc.")
            .setRequired(true);

        const descInput = new TextInputBuilder()
            .setCustomId('description')
            .setLabel("Description")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Describe in detail what you need")
            .setRequired(true);

        const refInput = new TextInputBuilder()
            .setCustomId('links')
            .setLabel("Links (to images, links, etc.)")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Insert useful links. You can attach files directly in the channel later!")
            .setRequired(false);

        commonModal.addComponents(
            new ActionRowBuilder().addComponents(deadlineInput),
            new ActionRowBuilder().addComponents(budgetInput),
            new ActionRowBuilder().addComponents(descInput),
            new ActionRowBuilder().addComponents(refInput),
        );

        await interaction.showModal(commonModal);
    }

    // ==========================================
    // 2. INVIO COMMON MODAL & CREAZIONE BOTTONE
    // ==========================================
    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_form_')) {
        const selectedService = interaction.customId.replace('ticket_form_', '');

        const deadline = interaction.fields.getTextInputValue('deadline');
        const budget = interaction.fields.getTextInputValue('budget');
        const description = interaction.fields.getTextInputValue('description');
        const references = interaction.fields.getTextInputValue('links') || "No link was provided";

        const ticketEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('📋 New Request')
            .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
            .setDescription(`Basic details of the ticket opened by <@${interaction.user.id}>.`)
            .addFields(
                { name: '🔹 Service Type', value: selectedService, inline: true },
                { name: '⏳ Deadline', value: deadline, inline: true },
                { name: '💰 Budget', value: budget, inline: true },
                { name: '📝 Description', value: description, inline: false },
                { name: '🔗 References', value: references, inline: false }
            )
            .setTimestamp();

        await interaction.channel.send({ embeds: [ticketEmbed] });

        const nextStepButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`open_specific_modal_${selectedService}`)
                .setLabel(`Continue with the details for ${selectedService}`)
                .setStyle(ButtonStyle.Success)
        );

        // Rispondiamo all'interazione del modal
        await interaction.reply({
            content: `Great job <@${interaction.user.id}>! First part completed. Click below for the final details specific to **${selectedService}**.`,
            components: [nextStepButton],
        });

        // Eliminiamo il messaggio originale (quello con il menu a tendina)
        try {
            if (interaction.message) {
                await interaction.message.delete();
            }
        } catch (e) {
            console.log("Failed to delete the menu message after modal submit");
        }
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
                .setTitle('Build Specific Details');

            const sizeInput = new TextInputBuilder()
                .setCustomId('build_size')
                .setLabel("Size (E.g. 100x100, 250x250)")
                .setPlaceholder("Enter the dimensions of the build...")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const elementsInput = new TextInputBuilder()
                .setCustomId('build_elements')
                .setLabel("Elements to include")
                .setPlaceholder("Houses, terrain, trees, specific structures...")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            const versionInput = new TextInputBuilder()
                .setCustomId('build_version')
                .setLabel("Minecraft Version")
                .setPlaceholder("E.g. 1.20.4, 1.8.9, Bedrock...")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const formatInput = new TextInputBuilder()
                .setCustomId('build_format')
                .setLabel("Delivery Format")
                .setPlaceholder("E.g. .schematic, .litematic, World folder...")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const infoInput = new TextInputBuilder()
                .setCustomId('build_additional_info')
                .setLabel("Additional Information")
                .setPlaceholder("Any extra details we should know?")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false);

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

            const sizeInput = new TextInputBuilder()
                .setCustomId('skin_size')
                .setLabel("Skin Size (Steve or Alex)")
                .setPlaceholder("Steve (Classic 4px arms) or Alex (Slim 3px arms)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const infoInput = new TextInputBuilder()
                .setCustomId('skin_additional_info')
                .setLabel("Additional Information")
                .setPlaceholder("Any extra details, accessories, or specific features?")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false);

            specificModal.addComponents(
                new ActionRowBuilder().addComponents(sizeInput),
                new ActionRowBuilder().addComponents(infoInput)
            );
        } else if (selectedService === 'Model') {
            specificModal = new ModalBuilder()
                .setCustomId('specific_modal_Model')
                .setTitle('Model Specific Details');

            const textureInput = new TextInputBuilder()
                .setCustomId('model_texture')
                .setLabel("Texture Resolution")
                .setPlaceholder("E.g. 16x16, 32x32, 128x128...")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const animationInput = new TextInputBuilder()
                .setCustomId('model_animations')
                .setLabel("Do you need any animations?")
                .setPlaceholder("E.g. Idle, walking, attack, or None")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const versionInput = new TextInputBuilder()
                .setCustomId('model_version')
                .setLabel("Minecraft Version")
                .setPlaceholder("E.g. 1.20.4, 1.19.2, Bedrock...")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const implementationInput = new TextInputBuilder()
                .setCustomId('model_implementation')
                .setLabel("How should we implement the model?")
                .setPlaceholder("E.g. ItemsAdder, Oraxen, Vanilla Resource Pack...")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const infoInput = new TextInputBuilder()
                .setCustomId('model_additional_info')
                .setLabel("Additional Information")
                .setPlaceholder("Any extra details or specific requirements?")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false);

            specificModal.addComponents(
                new ActionRowBuilder().addComponents(textureInput),
                new ActionRowBuilder().addComponents(animationInput),
                new ActionRowBuilder().addComponents(versionInput),
                new ActionRowBuilder().addComponents(implementationInput),
                new ActionRowBuilder().addComponents(infoInput)
            );
        } else if (selectedService === 'Plugin') {
            specificModal = new ModalBuilder()
                .setCustomId('specific_modal_Plugin')
                .setTitle('Plugin Specific Details');

            const softwareInput = new TextInputBuilder()
                .setCustomId('plugin_software')
                .setLabel("Server Software")
                .setPlaceholder("E.g. Spigot, Paper, Purpur, BungeeCord...")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const functionsInput = new TextInputBuilder()
                .setCustomId('plugin_functions')
                .setLabel("Main Functionalities")
                .setPlaceholder("E.g. GUI menus, scoreboard, custom items, etc.")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            const integrationsInput = new TextInputBuilder()
                .setCustomId('plugin_integrations')
                .setLabel("Integrations (Optional)")
                .setPlaceholder("E.g. Vault, PlaceholderAPI, LuckPerms, etc.")
                .setStyle(TextInputStyle.Short)
                .setRequired(false);

            const additionsInput = new TextInputBuilder()
                .setCustomId('plugin_additions')
                .setLabel("Additions needed?")
                .setPlaceholder("E.g. GUI, config.yml, lang.yml, etc.")
                .setStyle(TextInputStyle.Short)
                .setRequired(false);

            const databaseInput = new TextInputBuilder()
                .setCustomId('plugin_database')
                .setLabel("Database Requirements")
                .setPlaceholder("E.g. No, YAML, SQLite, MySQL...")
                .setStyle(TextInputStyle.Short)
                .setRequired(false);

            specificModal.addComponents(
                new ActionRowBuilder().addComponents(softwareInput),
                new ActionRowBuilder().addComponents(functionsInput),
                new ActionRowBuilder().addComponents(integrationsInput),
                new ActionRowBuilder().addComponents(additionsInput),
                new ActionRowBuilder().addComponents(databaseInput)
            );
        } else {
            // Eliminiamo il messaggio con il bottone per il servizio "Other"
            try {
                if (interaction.message) {
                    await interaction.message.delete();
                }
            } catch (e) {
                console.log("Failed to remove the button for the 'Other' service");
            }

            // Inviamo il messaggio di conferma finale pubblico nel canale
            await interaction.channel.send({
                content: "✅ No additional details are required for this service. A staff member will get back to you shortly.",
            });

            // Dato che per Discord dobbiamo sempre rispondere all'interazione se non apriamo un modal:
            return interaction.reply({ content: "Operation completed.", flags: MessageFlags.Ephemeral });
        }

        await interaction.showModal(specificModal);
    }

    // ==========================================
    // 4. INVIO MODAL SPECIFICO (Build, Skin, Model, Plugin)
    // ==========================================
    if (interaction.isModalSubmit() && interaction.customId.startsWith('specific_modal_')) {
        const selectedService = interaction.customId.replace('specific_modal_', '');

        const extraEmbed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle(`✅ Additional Details: ${selectedService}`)
            .setFooter({ text: 'All details have been successfully collected.' });

        if (selectedService === 'Build') {
            extraEmbed.addFields(
                { name: '📏 Size', value: interaction.fields.getTextInputValue('build_size'), inline: true },
                { name: '📦 Version', value: interaction.fields.getTextInputValue('build_version'), inline: true },
                { name: '💾 Format', value: interaction.fields.getTextInputValue('build_format'), inline: true },
                { name: '🧱 Elements', value: interaction.fields.getTextInputValue('build_elements'), inline: false },
                { name: '➕ Additional Info', value: interaction.fields.getTextInputValue('build_additional_info') || "No additional info were provided.", inline: false }
            );
        } else if (selectedService === 'Skin') {
            extraEmbed.addFields(
                { name: '📏 Skin Size', value: interaction.fields.getTextInputValue('skin_size'), inline: true },
                { name: '➕ Additional Info', value: interaction.fields.getTextInputValue('skin_additional_info') || "No additional info were provided.", inline: false }
            );
        } else if (selectedService === 'Model') {
            extraEmbed.addFields(
                { name: '🎨 Texture Res', value: interaction.fields.getTextInputValue('model_texture'), inline: true },
                { name: '🎬 Animations', value: interaction.fields.getTextInputValue('model_animations'), inline: true },
                { name: '📦 Version', value: interaction.fields.getTextInputValue('model_version'), inline: true },
                { name: '⚙️ Implementation', value: interaction.fields.getTextInputValue('model_implementation'), inline: false },
                { name: '➕ Additional Info', value: interaction.fields.getTextInputValue('model_additional_info') || "No additional info were provided.", inline: false }
            );
        } else if (selectedService === 'Plugin') {
            extraEmbed.addFields(
                { name: '⚙️ Server Software', value: interaction.fields.getTextInputValue('plugin_software'), inline: true },
                { name: '🗄️ Database', value: interaction.fields.getTextInputValue('plugin_database'), inline: true },
                { name: '🧩 Integrations', value: interaction.fields.getTextInputValue('plugin_integrations') || "No integrations where provided.", inline: true },
                { name: '🛠️ Additions', value: interaction.fields.getTextInputValue('plugin_additions'), inline: false },
                { name: '📜 Main Functionalities', value: interaction.fields.getTextInputValue('plugin_functions'), inline: false }
            );
        }

        // Inviamo l'embed aggiuntivo
        await interaction.channel.send({ embeds: [extraEmbed] });

        // Inviamo il messaggio di conferma finale pubblico nel canale
        await interaction.channel.send({
            content: `Perfect! We’ve collected all the details for your **${selectedService}**. A staff member will take over your ticket shortly.`
        });

        // Rispondiamo all'interazione del modal per non far crashare Discord, ma usiamo un messaggio effimero di servizio
        await interaction.reply({ content: "Details submitted successfully.", flags: MessageFlags.Ephemeral });

        // Eliminiamo il messaggio con il bottone "Continue"
        try {
            if (interaction.message) {
                await interaction.message.delete();
            }
        } catch (e) {
            console.log("Failed to delete the button message after final modal submit");
        }
    }
});

client.login(token).catch(errore => {
    console.log("C'è stato un problema durante il login:");
    console.error(errore)
});