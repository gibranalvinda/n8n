const axios = require('axios');
const asyncRetry = require('async-retry');

class TikTokMetadata {
        constructor() {
                this.description = {
                        displayName: 'TikTok Metadata',
                        name: 'tiktokMetadata',
                        icon: 'file:tiktok.png',
                        group: ['tiktok'],
                        version: 1,
                        description: 'Download video or image data from a public TikTok URL.',
                        defaults: {
                                name: 'TikTok Metadata',
                        },
                        inputs: ['main'],
                        outputs: ['main'],
                        properties: [
                                {
                                        displayName: 'TikTok URL',
                                        name: 'url',
                                        type: 'string',
                                        default: '',
                                        placeholder: 'https://www.tiktok.com/@user/video/123456789',
                                        required: true,
                                },
                        ],
                };
        }

        async execute() {
                const items = this.getInputData();
                const returnData = [];

                for (let i = 0; i < items.length; i++) {
                        try {
                                const url = this.getNodeParameter('url', i);

                                // 🔄 Retry otomatis kalau gagal
                                const response = await asyncRetry(
                                        async () => {
                                                const res = await axios.get(
                                                        `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`
                                                );
                                                if (!res.data || !res.data.data) {
                                                        throw new Error('Failed to fetch TikTok data');
                                                }
                                                return res.data;
                                        },
                                        { retries: 3 }
                                );

                                const data = response.data;

                                // ✨ Format hasil biar rapih
                                const formatted = {
                                        status: response.code === 0 ? 'success' : 'error',
                                        id: data.id,
                                        title: data.title,
                                        createTime: data.create_time,
                                        duration: data.duration,
                                        author: {
                                                id: data.author.id,
                                                uniqueId: data.author.unique_id,
                                                nickname: data.author.nickname,
                                        },
                                        video: {
                                                play: data.play,
                                                download: data.play,
                                                wmplay: data.wmplay,
                                                cover: data.cover,
                                                music: data.music,
                                        },
                                        stats: {
                                                like: data.digg_count,
                                                share: data.share_count,
                                                comment: data.comment_count,
                                                download: data.download_count,
                                        },
                                };

                                returnData.push({ json: formatted });
                        } catch (error) {
                                returnData.push({
                                        json: {
                                                status: 'error',
                                                message: error.message,
                                        },
                                });
                        }
                }

                return this.prepareOutputData(returnData);
        }
}

module.exports = { TikTokMetadata };
