import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import Mic from 'node-mic';

// Declare variables
let micInstance: any;
let audioFile: string = '';
let metadataFile: string;
let voiceCommentsFolder: string;

// Function to create or check the folder and metadata file
function ensureVoiceCommentSetup() {
    console.log('Ensuring voice comment setup...');
    voiceCommentsFolder = path.join(vscode.workspace.rootPath || '', 'voice-comments');
    metadataFile = path.join(vscode.workspace.rootPath || '', 'voice-comments.json');

    if (!fs.existsSync(voiceCommentsFolder)) {
        console.log('Creating voice comments folder...');
        fs.mkdirSync(voiceCommentsFolder);
    } else {
        console.log('Voice comments folder already exists.');
    }

    if (!fs.existsSync(metadataFile)) {
        console.log('Creating metadata file...');
        fs.writeFileSync(metadataFile, JSON.stringify({ comments: [] }, null, 2));
    } else {
        console.log('Metadata file already exists.');
    }
}

// Function to generate a unique hash based on the line content
function generateHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
    }
    return hash.toString();
}

// Function to decorate lines with comments
function decorateLinesWithVoiceComments(editor: vscode.TextEditor) {
    console.log('Decorating lines with voice comments...');
    const decorationType = vscode.window.createTextEditorDecorationType({
        gutterIconPath: path.join(__dirname, 'comments.png'),
        gutterIconSize: 'contain'
    });

    let metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
    const comments = metadata.comments.filter((c: any) => c.file === editor.document.uri.fsPath);

    const ranges: vscode.Range[] = comments.map((comment: any) => {
        const lineContent = editor.document.lineAt(comment.line).text;
        if (generateHash(lineContent) === comment.hash) {
            return new vscode.Range(comment.line, 0, comment.line, 1);
        }
    }).filter((range: vscode.Range | undefined) => range !== undefined) as vscode.Range[];

    editor.setDecorations(decorationType, ranges);
}

// This function is called when the extension is activated
export function activate(context: vscode.ExtensionContext) {
    console.log('Activating voice comments extension...');
    ensureVoiceCommentSetup();

    // Register the command for starting voice comment
    let startVoiceComment = vscode.commands.registerCommand('extension.startVoiceComment', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const line = editor.selection.active.line;
            const filePath = editor.document.uri.fsPath;
            const lineContent = editor.document.lineAt(line).text;
            const hash = generateHash(lineContent); // Generate a hash based on the line content

            // Generate a unique audio file name
            audioFile = path.join(voiceCommentsFolder, `comment_${Date.now()}.wav`);

            // Start recording using Mic
            micInstance = new Mic();
            const micInputStream = micInstance.startRecording();
            const outputFileStream = fs.createWriteStream(audioFile);
            micInputStream.pipe(outputFileStream);

            console.log(`Recording voice comment for line ${line} in file ${filePath}...`);

            // Store the line and file reference in the metadata when recording starts
            let metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
            metadata.comments.push({
                file: filePath,
                line: line,
                audio: audioFile,
                hash: hash // Store the hash to track content
            });
            fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
        }
    });

    // Register the command for stopping the recording
    let stopVoiceComment = vscode.commands.registerCommand('extension.stopVoiceComment', () => {
        if (micInstance) {
            micInstance.stopRecording();
            console.log('Voice comment recording stopped.');
        }
    });

    // Register the command for playing a voice comment
    let playVoiceComment = vscode.commands.registerCommand('extension.playVoiceComment', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const line = editor.selection.active.line;
            const filePath = editor.document.uri.fsPath;
            const lineContent = editor.document.lineAt(line).text;
            const hash = generateHash(lineContent); // Generate a hash based on the line content

            // Find the corresponding audio file for the current line
            let metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
            const comment = metadata.comments.find((c: any) => c.file === filePath && c.hash === hash);

            if (comment) {
                console.log(`Playing voice comment for line ${line} in file ${filePath}...`);
                const playSoundModule = require('play-sound');
                const player = playSoundModule({});

                player.play(comment.audio, (err: any) => {
                    if (err) {
                        vscode.window.showErrorMessage('Error playing audio: ' + err.message);
                    } else {
                        vscode.window.showInformationMessage('Playing voice comment...');
                    }
                });
            } else {
                vscode.window.showInformationMessage('No voice comment found for this line.');
            }
        }
    });

    // Register the command for deleting a voice comment
    let deleteVoiceComment = vscode.commands.registerCommand('extension.deleteVoiceComment', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const line = editor.selection.active.line;
            const filePath = editor.document.uri.fsPath;
            const lineContent = editor.document.lineAt(line).text;
            const hash = generateHash(lineContent); // Generate a hash based on the line content

            // Find the corresponding audio file for the current line and delete it
            let metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
            const commentIndex = metadata.comments.findIndex((c: any) => c.file === filePath && c.hash === hash);

            if (commentIndex !== -1) {
                const comment = metadata.comments[commentIndex];

                // Delete the audio file
                if (fs.existsSync(comment.audio)) {
                    fs.unlinkSync(comment.audio);
                }

                // Remove the metadata entry
                metadata.comments.splice(commentIndex, 1);
                fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));

                vscode.window.showInformationMessage('Voice comment deleted.');
                console.log('Voice comment deleted.');
            } else {
                vscode.window.showInformationMessage('No voice comment found to delete.');
                console.log('No voice comment found to delete.');
            }
        }
    });

    // Add commands to the context so they are available in the command palette
    context.subscriptions.push(startVoiceComment);
    context.subscriptions.push(stopVoiceComment);
    context.subscriptions.push(playVoiceComment);
    context.subscriptions.push(deleteVoiceComment);

    // Add a status bar item for starting and stopping recording
    let recordingButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    recordingButton.text = '$(mic) Start Recording';
    recordingButton.command = 'extension.startVoiceComment';
    recordingButton.show();

    context.subscriptions.push(recordingButton);

    // Automatically decorate lines with comments on editor change
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
            decorateLinesWithVoiceComments(editor);
        }
    });

    vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.activeTextEditor;
        if (editor && event.document === editor.document) {
            decorateLinesWithVoiceComments(editor);
        }
    });
}
