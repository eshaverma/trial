/**
 * Copyright 2018 Box Inc.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* External modules */
const BoxSDK = require('box-node-sdk');
const path = require('path');
const trimStart = require('lodash/trimStart');

const sdk = new BoxSDK({
    clientID: 'BoxSkillsClientId',
    clientSecret: 'BoxSkillsClientSecret'
});

const BOX_API_ENDPOINT = 'https://api.box.com/2.0';
const MB_INTO_BYTES = 1048576;
const FileType = {
    AUDIO: 'AUDIO',
    VIDEO: 'VIDEO',
    IMAGE: 'IMAGE',
    DOCUMENT: 'DOCUMENT'
};

const boxVideoFormats = ['3g2', '3gp', 'avi', 'flv', 'm2v', 'm2ts', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg'];
boxVideoFormats.push('mpg', 'ogg', 'mts', 'qt', 'ts', 'wmv');
const boxAudioFormats = ['aac', 'aif', 'aifc', 'aiff', 'amr', 'au', 'flac', 'm4a', 'mp3', 'ra', 'wav', 'wma'];
const boxDocumentFormats = ['pdf'];

const getFileFormat = fileName => {
    const fileExtension = path.extname(fileName);
    return trimStart(fileExtension, '.');
};
const getFileType = fileFormat => {
    if (boxAudioFormats.includes(fileFormat)) return FileType.AUDIO;
    else if (boxDocumentFormats.includes(fileFormat)) return FileType.DOCUMENT;
    else if (boxVideoFormats.includes(fileFormat)) return FileType.VIDEO;
    return FileType.IMAGE;
};
/**
 * FilesReader :- A helpful client to capture file related information from
 * incoming Box Skills event  and to access the file's content.
 *
 * API:-
 * FilesReader.getFileContext () : JSON
 * FilesReader.validateFormat (allowedFileFormatsList) : boolean
 * FilesReader.validateSize (allowedMegabytesNum) : boolean
 * async FilesReader.getContentBase64 () : string
 * FilesReader.getContentStream () : stream
 * async FilesReader.getBasicFormatFileURL () : string
 * async FilesReader.getBasicFormatContentBase64 () : string
 * FilesReader.getBasicFormatContentStream () : string
 *
 * Note: BasicFormat functions allows you to access your files stored in Box in
 * another format, which may be more accepted by ML providers. The provided basic
 * formats are Audio files→.mp3, Document/Image files→.jpeg . Video files→.mp4.
 * Caution should be applied using BasicFormats for certain large files as it
 * involves a time delay, and your skill code or skills-engine request may
 * time out before the converted format is fetched.
 * @constructor
 * @param {Object} eventBody - Box Event Body
 */

function FilesReader(eventBody) {
    this.requestId = eventBody.id;
    this.skillId = eventBody.skill.id;
    this.fileId = eventBody.source.id;
    this.fileName = eventBody.source.name;
    this.fileSize = eventBody.source.size;
    this.fileFormat = getFileFormat(this.fileName);
    this.fileType = getFileType(this.fileFormat);
    this.fileReadToken = eventBody.token.read.access_token;
    this.fileWriteToken = eventBody.token.write.access_token;
    this.fileReadClient = sdk.getBasicClient(this.fileReadToken);
}

/**
 * MetadataWriter :- A helpful class to write back Metadata Cards for
 * Topics, Transcripts, Timelines, Errors and Statuses back to Box for
 * any file for which a Skills Event is sent out.
 *
 * API:-
 */
function MetadataWriter(fileContext) {
    this.fileWriteClient = sdk.getBasicClient(fileContext.fileWriteToken);
}

/** FilesReader private functions */

/**
 * reads a ReadStream into a buffer that it then converts to a string
 * @param  Object stream - read stream
 * @return Promise - resolves to the string of information read from the stream
 */
const readStreamToString = stream => {
    if (!stream || typeof stream !== 'object') {
        throw new TypeError('Invalid Stream, must be a readable stream.');
    }
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', chunk => {
            chunks.push(chunk);
        });
        stream.on('error', err => {
            reject(err);
        });
        stream.on('end', () => {
            resolve(Buffer.concat(chunks).toString('utf8'));
        });
    });
};

/** FilesReader public functions */

/**
 * getFileContext reads a ReadStream into a buffer that it then converts to a string
 *
 * @param  {Object} stream - read stream
 * @return Promise - resolves to the string of information read from the stream
 * @memberof FilesReader
 */
const getFileContext = function() {
    // FilesReader.prototype.getFileContext = function getFileContext() {
    const fileDownloadURL = `${BOX_API_ENDPOINT}/files/${this.fileId}/content?access_token=${this.fileReadToken}`;
    return {
        requestId: this.requestId,
        skillId: this.skillId,
        fileId: this.fileId,
        fileName: this.fileName,
        fileSize: this.fileSize,
        fileDownloadURL,
        fileReadToken: this.fileReadToken,
        fileWriteToken: this.fileWriteToken
    };
};

FilesReader.getFileContext = getFileContext;
FilesReader.prototype.validateFormat = function validateFormat(allowedFileFormatsList) {
    const fileFormat = getFileFormat;
    if (allowedFileFormatsList.includes(fileFormat)) return true;
    throw new Error(`File format ${fileFormat} is not accepted by this skill`);
};

FilesReader.prototype.validateSize = function validateSize(allowedMegabytesNum) {
    const fileSizeMB = this.fileSize / MB_INTO_BYTES;
    if (fileSizeMB <= allowedMegabytesNum) return true;
    throw new Error(`File size ${fileSizeMB} MB is over accepted limit of ${allowedMegabytesNum} MB`);
};

FilesReader.prototype.getContentStream = function getContentStream() {
    return new Promise((resolve, reject) => {
        this.readClient.files.getReadStream(this.fileId, null, (error, stream) => {
            if (error) {
                reject(error);
            } else {
                resolve(stream);
            }
        });
    });
};

FilesReader.prototype.getContentBase64 = function getContentBase64() {
    return new Promise((resolve, reject) => {
        this.getContentStream()
            .then(stream => {
                resolve(readStreamToString(stream));
            })
            .then(content => {
                resolve(content);
            })
            .catch(e => {
                reject(e);
            });
    });
};

FilesReader.prototype.getBasicFormatFileURL = function getBasicFormatFileURL() {
    let representationType = '[jpg?dimensions=1024x1024]';
    if (this.fileType === FileType.AUDIO) representationType = '[mp3]';
    else if (this.fileType === FileType.VIDEO) representationType = '[mp4]';
    else if (this.fileType === FileType.DOCUMENT) representationType = '[pdf]';
    return new Promise((resolve, reject) => {
        this.readClient.files
            .getRepresentationInfo(this.fileId, representationType)
            .then(response => {
                resolve(response.headers.location);
            })
            .catch(e => {
                reject(e);
            });
    });
};

FilesReader.prototype.getBasicFormatContentStream = function getBasicFormatContentStream() {
    const downloadStreamOptions = {
        streaming: true,
        headers: {}
    };
    this.client.get(this.getBasicFormatFileURL(), downloadStreamOptions);
};

FilesReader.prototype.getBasicFormatContentBase64 = function getBasicFormatContentBase64() {
    return new Promise((resolve, reject) => {
        this.getBasicFormatContentStream()
            .then(stream => {
                resolve(readStreamToString(stream));
            })
            .then(content => {
                resolve(content);
            })
            .catch(e => {
                reject(e);
            });
    });
};

/** MetadataWriter.ErrorCode Enum private functions */

MetadataWriter.prototype.ErrorCodeEnum = {
    FILE_PROCESSING_ERROR: "We're sorry, something went wrong with processing the file.",

    INVALID_FILE_SIZE:
        "We're sorry, something went wrong with processing the file. This file size is currently not supported.",

    INVALID_FILE_FORMAT: "We're sorry, something went wrong with processing the file. Invalid information received.",

    INVALID_EVENT: "We're sorry, something went wrong with processing the file. Invalid information received.",

    NO_INFO_FOUND: "We're sorry, no skills information was found.",

    INVOCATIONS_ERROR: 'Something went wrong with running this skill or fetching its data.',

    EXTERNAL_AUTH_ERROR: 'Something went wrong with running this skill or fetching its data.',

    BILLING_ERROR: 'Something went wrong with running this skill or fetching its data.',

    UNKNOWN: 'Something went wrong with running this skill or fetching its data.'
};

/** MetadataWriter private functions */
