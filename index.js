// @ts-check
const fs = require('node:fs');
const path = require('node:path');
const {Client, Collection, Events, GatewayIntentBits, MessageFlags} = require('discord.js');
const {token} = require('./config.json');
// 1. Configura i permessi (Intents) di cosa il bot può "vedere"
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent // Necessario per leggere il testo dei messaggi
    ]
});


client.once('clientReady', () => {
    console.log(`Bot online! Loggato come ${client.user.tag}`);
});

client.commands = new Collection();
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);
for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        // Set a new item in the Collection with the key as the command name and the value as the exported module
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
}

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
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
                content: 'There was an error while executing this command!',
                flags: MessageFlags.Ephemeral,
            });
        } else {
            await interaction.reply({
                content: 'There was an error while executing this command!',
                flags: MessageFlags.Ephemeral,
            });
        }
    }
});

const {ticketCategoryId} = require('./config.json');

client.on('interactionCreate', async interaction => {
    // 1. Filtriamo: ci interessano solo i bottoni
    if (!interaction.isButton()) return;

    // 2. Controlliamo QUALE bottone è stato premuto tramite il customId
    if (interaction.customId === 'ticket_open') {

        try {
            // Risposta immediata (obbligatoria entro 3 secondi)
            // Usiamo ephemeral così lo vede solo chi ha cliccato
            await interaction.reply({
                content: 'Sto creando il tuo ticket privato... ⏳',
                ephemeral: true
            });

            // LOGICA DI CREAZIONE CANALE
            // Qui andrà il codice per interaction.guild.channels.create
            console.log(`Ticket richiesto da: ${interaction.user.tag}`);

            // Esempio rapido di creazione:
            const ticketChannel = await interaction.guild.channels.create({
                name: `ticket-${interaction.user.username}`,
                type: 0,
                parent: ticketCategoryId,
                permissionOverwrites: [
                    {
                        id: interaction.user.id,  // L'utente che ha cliccato
                        allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
                    },
                    // Opzionale: aggiungi qui l'ID del ruolo Staff per farglielo vedere
                ],
            });

            // Aggiorniamo la risposta dicendo che è pronto
            await interaction.editReply({
                content: `Ma sei proprio baka! Vai qui: ${ticketChannel}`
            });

        } catch (error) {
            console.error(error);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({content: 'Errore durante la creazione del ticket.'});
            }
        }
    }
});

client.login(token).catch(errore => {
    console.log("C'è stato un problema durante il login:");
    console.error(errore)
});