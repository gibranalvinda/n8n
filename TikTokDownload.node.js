const axios = require('axios');

class TikTokDownload {
        constructor() {
                this.description = {
                        displayName: 'TikTok File Download',
                        name: 'tiktokDownload',
                        icon: 'file:tiktok.png',
                        group: ['transform'],
                        version: 1,
                        description: 'Download TikTok video from direct URL',
                        defaults: { name: 'TikTok File Download' },
                        inputs: ['main'],
                        outputs: ['main'],
                        properties: [
                                {
                                        displayName: 'Download URL',
                                        name: 'url',
                                        type: 'string',
                                        default: '',
                                        required: true,
                                },
                                {
                                        displayName: 'File Name',
                                        name: 'fileName',
                                        type: 'string',
                                        default: 'tiktok.mp4',
                                },
                        ],
                };
        }

        async execute() {
                const items = this.getInputData();
                const returnData = [];

                for (let i = 0; i < items.length; i++) {
                        const url = this.getNodeParameter('url', i);
                        const fileName = this.getNodeParameter('fileName', i);

                        const res = await axios.get(url, { responseType: 'arraybuffer' });
                        const data = Buffer.from(res.data, 'binary');

                        returnData.push({
                                json: { success: true, fileName },
                                binary: { data: await this.helpers.prepareBinaryData(data, fileName, 'video/mp4') },
                        });
                }

                return this.prepareOutputData(returnData);
        }
}

module.exports = { TikTokDownload };
