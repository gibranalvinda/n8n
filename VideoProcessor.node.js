const { INodeType, INodeTypeDescription } = require('n8n-workflow');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs').promises;
const fssync = require('fs');
const moment = require('moment');
const path = require('path');

function printLog(str) {
        const date = moment().format('HH:mm:ss');
        console.log(`[${date}] ${str}`);
}

async function resizeAndOverlayVideo(
        inputVideoPath,
        outputVideoPath,
        backgroundImagePath,
        tempOutputPath,
        width = 950,
        height = 1700,
        blurRadius = 10
) {
        return new Promise((resolve, reject) => {
                try {
                        ffmpeg(inputVideoPath)
                                .size(`${width}x${height}`)
                                .on('error', (err) => reject(err))
                                .on('end', () => {
                                        printLog('INFO: Video resizing completed.');
                                        ffmpeg(inputVideoPath)
                                                .videoFilters(`scale=1080:1920,boxblur=${blurRadius}:${blurRadius}`)
                                                .frames(1)
                                                .output(backgroundImagePath)
                                                .on('error', (err) => reject(err))
                                                .on('end', () => {
                                                        printLog('INFO: Background created.');
                                                        ffmpeg()
                                                                .audioFilter(
                                                                        'pan=stereo|c0<0*c0+c1|c1<0*c0+c1,aeval=-val(0)|val(1),volume=1.6'
                                                                )
                                                                .input(backgroundImagePath)
                                                                .input(tempOutputPath)
                                                                .complexFilter('[0:v][1:v]overlay=(W-w)/2:(H-h)/2[outv]')
                                                                .outputOptions([
                                                                        '-map',
                                                                        '[outv]',
                                                                        '-map',
                                                                        '1:a',
                                                                        '-r 30',
                                                                        '-g 60',
                                                                        '-profile:v main',
                                                                        '-level 3.1',
                                                                        '-acodec libmp3lame',
                                                                        '-ar 44100',
                                                                        '-threads 0',
                                                                        '-preset superfast',
                                                                ])
                                                                .output(outputVideoPath)
                                                                .on('error', (err) => reject(err))
                                                                .on('end', async () => {
                                                                        printLog('INFO: Video with background created.');
                                                                        try {
                                                                                await fs.unlink(tempOutputPath);
                                                                                await fs.unlink(backgroundImagePath);
                                                                        } catch (cleanupErr) {
                                                                                console.error('Cleanup error:', cleanupErr);
                                                                        }
                                                                        resolve();
                                                                })
                                                                .run();
                                                })
                                                .run();
                                })
                                .save(tempOutputPath);
                } catch (error) {
                        reject(error);
                }
        });
}

class VideoProcessor {
        description = {
                displayName: 'Video Processor',
                name: 'videoProcessor',
                icon: 'file:tiktok.png',
                group: ['transform'],
                version: 1,
                description: 'Resize and overlay video with blurred background',
                defaults: {
                        name: 'Video Processor',
                },
                inputs: ['main'],
                outputs: ['main'],
                properties: [
                        {
                                displayName: 'Input Binary Field',
                                name: 'inputFieldName',
                                type: 'string',
                                default: 'data',
                                description: 'Name of the input binary property containing the video',
                        },
                        {
                                displayName: 'Output File Name',
                                name: 'outputFileName',
                                type: 'string',
                                default: 'output.mp4',
                                required: true,
                        },
                ],
        };

        async execute() {
                const items = this.getInputData();
                const returnData = [];

                for (let i = 0; i < items.length; i++) {
                        const inputFieldName = this.getNodeParameter('inputFieldName', i);
                        const outputFileName = this.getNodeParameter('outputFileName', i);

                        // ambil binary video dari item
                        if (!items[i].binary || !items[i].binary[inputFieldName]) {
                                throw new Error(`Binary property "${inputFieldName}" is missing in input`);
                        }

                        // Convert base64 to Buffer
                        const videoData = Buffer.from(items[i].binary[inputFieldName].data, 'base64');

                        // simpan ke file tmp
                        const inputPath = path.join('/tmp', `input-${Date.now()}.mp4`);
                        const tempOutputPath = path.join('/tmp', `temp-${Date.now()}.mp4`);
                        const backgroundImagePath = path.join('/tmp', `bg-${Date.now()}.jpg`);
                        const outputPath = path.join('/tmp', outputFileName);

                        fssync.writeFileSync(inputPath, videoData);

                        // proses ffmpeg
                        await resizeAndOverlayVideo(inputPath, outputPath, backgroundImagePath, tempOutputPath);

                        // load hasil
                        const resultBuffer = await fs.readFile(outputPath);

                        returnData.push({
                                json: { success: true, fileName: outputFileName },
                                binary: {
                                        data: await this.helpers.prepareBinaryData(
                                                resultBuffer,
                                                outputFileName,
                                                'video/mp4'
                                        ),
                                },
                        });

                        // cleanup input & output tmp file
                        try {
                                await fs.unlink(inputPath);
                                await fs.unlink(outputPath);
                        } catch (err) {
                                console.error('Cleanup error:', err);
                        }
                }

                return this.prepareOutputData(returnData);
        }
}

module.exports = { VideoProcessor };
