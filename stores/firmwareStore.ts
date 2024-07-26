import {
  ESPLoader,
  type FlashOptions,
  type LoaderOptions,
  Transport,
} from 'esptool-js';
import { saveAs } from 'file-saver';
import { mande } from 'mande';
import { defineStore } from 'pinia';
import { Terminal } from 'xterm';

import {
  BlobReader,
  BlobWriter,
  ZipReader,
} from '@zip.js/zip.js';

import {
  type FirmwareResource,
  getCorsFriendyReleaseUrl,
} from '../types/api';
import { createUrl } from './store';

const firmwareApi = mande(createUrl('api/github/firmware/list'))

export const useFirmwareStore = defineStore('firmware', {
  state: () => {
    return {
      stable: [<FirmwareResource>{
        id: "v2.4.0.46d7b82",
        title: "Meshtastic DEFCON 2024 Edition Firmware",
        page_url: "https://github.com/meshtastic/firmware/releases/tag/v2.4.0.46d7b82",
        zip_url: "https://github.com/meshtastic/firmware/releases/download/v2.4.0.46d7b82/firmware-2.4.0.46d7b82.zip",
        release_notes: "> [!IMPORTANT]  \r\n> Version 2.4 along with the last 2.3.X update brings some default traffic management practices to increase the resilience of larger meshes and allow more airtime for messaging. Some of the important changes which help accomplish this:\r\n> - Deprecation of `ROUTER_CLIENT` role (2.3.15)\r\n> - Move up all telemetry default intervals to every 30 minutes (instead of 15 minutes)\r\n> - Don't send node info interrogation for unknown nodes when Ch. utilization is >25%\r\n> - Scale configured / default intervals back based on _online_ mesh size > 40 nodes\r\n> - Requesting history from a Store & Forward Server over LoRa is not available on the channel with default key. As a new feature, when connecting to it with a client app, the history will be retrieved automatically.\r\n\r\n\r\n## Enhancements \r\n* Add wio-sdk-wm1110 to build. by @fifieldt in https://github.com/meshtastic/firmware/pull/4258\r\n* Add Heltec new boards. by @Heltec-Aaron-Lee in https://github.com/meshtastic/firmware/pull/4226\r\n* GPS Power State tidy-up by @todd-herbert in https://github.com/meshtastic/firmware/pull/4161\r\n* Optimize the shutdown current of RAK10701 to around 25uA by @DanielCao0 in https://github.com/meshtastic/firmware/pull/4260\r\n* INA3221 sensor: use for bus voltage & environment metrics by @warrenguy in https://github.com/meshtastic/firmware/pull/4215\r\n* WM1110 SDK kit enter serial DFU and add deployment packages by @thebentern in https://github.com/meshtastic/firmware/pull/4266\r\n* Show specific frame when updating screen by @todd-herbert in https://github.com/meshtastic/firmware/pull/4264\r\n* Move up telemetry defaults to every 30 minutes by @thebentern in https://github.com/meshtastic/firmware/pull/4274\r\n* Don't send node info interrogation when ch. util is >25% by @thebentern in https://github.com/meshtastic/firmware/pull/4273\r\n* Scale default intervals for *online* mesh size past 40 nodes by @thebentern in https://github.com/meshtastic/firmware/pull/4277\r\n* Add Seeed Wio WM1110 to Github issue template by @fifieldt in https://github.com/meshtastic/firmware/pull/4283\r\n* Let StoreForward server send history to phoneAPI by @GUVWAF in https://github.com/meshtastic/firmware/pull/4282\r\n* Initial work for Heltec Vision Master 213 by @HarukiToreda, @todd-herbert in https://github.com/meshtastic/firmware/pull/4286\r\n\r\n## Bug fixes\r\n* Fix that Dockerfile would not run with podman by @r41d in https://github.com/meshtastic/firmware/pull/4262\r\n* Fix python warning in uf2conf by @geeksville in https://github.com/meshtastic/firmware/pull/4235\r\n* Remove softdevice folder from wio-sdk-wm1110 by @fifieldt in https://github.com/meshtastic/firmware/pull/4295\r\n* Migrate to new module config interval defaults by @thebentern in https://github.com/meshtastic/firmware/pull/4294\r\n\r\n## New Contributors\r\n* @r41d made their first contribution in https://github.com/meshtastic/firmware/pull/4262\r\n\r\n**Full Changelog**: https://github.com/meshtastic/firmware/compare/v2.3.15.deb7c27...v2.4.0.46d7b82"
      }],
      alpha: new Array<FirmwareResource>(),
      pullRequests: new Array<FirmwareResource>(),
      selectedFirmware: <FirmwareResource[] | undefined>[],
      selectedFile: <File | undefined>{},
      baudRate: 115200,
      hasSeenReleaseNotes: false,
      shouldCleanInstall: false,
      flashPercentDone: 0,
      isFlashing: false,
      flashingIndex: 0,
      isReaderLocked: false,
      isConnected: false,
      port: <SerialPort | undefined>{},
    }
  },
  getters: {
    hasOnlineFirmware: (state) => (state.selectedFirmware?.id || '').length > 0,
    hasFirmwareFile: (state) => (state.selectedFile?.name || '').length > 0,
    percentDone: (state) => `${state.flashPercentDone}%`,
    firmwareVersion: (state) => state.selectedFirmware?.id ? state.selectedFirmware.id.replace('v', '') : '.+',
    canShowFlash: (state) => state.selectedFirmware?.id ? state.hasSeenReleaseNotes : true, 
    isZipFile: (state) => state.selectedFile?.name.endsWith('.zip'),
  },
  actions: {
    continueToFlash() {
      this.hasSeenReleaseNotes = true
    },
    async fetchList() {
    },
    setSelectedFirmware(firmware: FirmwareResource) {
      this.selectedFirmware = firmware;
      this.selectedFile = undefined;
      this.hasSeenReleaseNotes = false;
    },
    getReleaseFileUrl(fileName: string): string {
      if (!this.selectedFirmware?.zip_url) return '';
      const baseUrl = getCorsFriendyReleaseUrl(this.selectedFirmware.zip_url);
      return `${baseUrl}/${fileName}`;
    },
    async downloadUf2FileSystem(searchRegex: RegExp) {
      const reader = new BlobReader(this.selectedFile!);
      const zipReader = new ZipReader(reader);
      const entries = await zipReader.getEntries()
      console.log('Zip entries:', entries);
      const file = entries.find(entry => searchRegex.test(entry.filename))
      if (file) {
        const data = await file.getData!(new BlobWriter());
        saveAs(data, file.filename);
      }
      else {
        throw new Error(`Could not find file with pattern ${searchRegex} in zip`);
      }
      zipReader.close();
    },
    async setFirmwareFile(file: File) {
      this.selectedFile = file;
      this.selectedFirmware = undefined;
    },
    async updateEspFlash(fileName: string) {
      const terminal = await openTerminal();
      this.port = await navigator.serial.requestPort({});
      this.isConnected = true;
      this.port.ondisconnect = () => {
        this.isConnected = false;
      };
      const transport = new Transport(this.port, true);
      const espLoader = await this.connectEsp32(transport, terminal);
      const content = await this.fetchBinaryContent(fileName);
      this.isFlashing = true;
      const flashOptions: FlashOptions = {
        fileArray: [{ data: content, address: 0x10000 }],
        flashSize: 'keep',
        eraseAll: false,
        compress: true,
        flashMode: 'keep',
        flashFreq: 'keep',
        reportProgress: (fileIndex, written, total) => {
          this.flashPercentDone = Math.round((written / total) * 100);
          if (written == total) {
            this.isFlashing = false;
            console.log('Done flashing!');
          }
        },
      };
      await this.startWrite(terminal, espLoader, transport, flashOptions);
    },
    async startWrite(terminal: Terminal, espLoader: ESPLoader, transport: Transport, flashOptions: FlashOptions) {
      await espLoader.writeFlash(flashOptions);
      await this.resetEsp32(transport);
      await this.readSerial(this.port!, terminal);
    },
    async resetEsp32(transport: Transport) {
      await transport.setRTS(true);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await transport.setRTS(false);
    },
    async cleanInstallEspFlash(fileName: string, otaFileName: string, littleFsFileName: string) {
      const terminal = await openTerminal();
      this.port = await navigator.serial.requestPort({});
      this.isConnected = true;
      this.port.ondisconnect = () => {
        this.isConnected = false;
      };
      const transport = new Transport(this.port, true);
      const espLoader = await this.connectEsp32(transport, terminal);
      const appContent = await this.fetchBinaryContent(fileName);
      const otaContent = await this.fetchBinaryContent(otaFileName);
      const littleFsContent = await this.fetchBinaryContent(littleFsFileName);
      this.isFlashing = true;
      const flashOptions: FlashOptions = {
        fileArray: [{ data: appContent, address: 0x00 }, { data: otaContent, address: 0x260000 }, { data: littleFsContent, address: 0x300000 }],
        flashSize: 'keep',
        eraseAll: true,
        compress: true,
        flashMode: 'keep',
        flashFreq: 'keep',
        reportProgress: (fileIndex, written, total) => {
          this.flashingIndex = fileIndex;
          this.flashPercentDone = Math.round((written / total) * 100);
          if (written == total && fileIndex > 1) {
            this.isFlashing = false;
            console.log('Done flashing!');
          }
        },
      };
      await this.startWrite(terminal, espLoader, transport, flashOptions);
    },
    async fetchBinaryContent(fileName: string): Promise<string> {
      if (this.selectedFirmware?.zip_url) {
        const baseUrl = getCorsFriendyReleaseUrl(this.selectedFirmware!.zip_url!);
        const response = await fetch(`${baseUrl}/${fileName}`);
        const blob = await response.blob();
        const data = await blob.arrayBuffer();
        return convertToBinaryString(new Uint8Array(data));
      } else if (this.selectedFile && this.isZipFile) {
        const reader = new BlobReader(this.selectedFile!);
        const zipReader = new ZipReader(reader);
        const entries = await zipReader.getEntries()
        console.log('Zip entries:', entries);
        console.log('Looking for file matching pattern:', fileName);
        const file = entries.find(entry => 
          {
            if (fileName.startsWith('firmware-tbeam-.'))
              return !entry.filename.includes('s3') && new RegExp(fileName).test(entry.filename) && (fileName.endsWith('update.bin') == entry.filename.endsWith('update.bin'))
            else 
              return new RegExp(fileName).test(entry.filename) && (fileName.endsWith('update.bin') == entry.filename.endsWith('update.bin'))
          })
        if (file) {
          console.log('Found file:', file.filename);
          const blob = await file.getData!(new BlobWriter());
          const arrayBuffer = await blob.arrayBuffer();
          return convertToBinaryString(new Uint8Array(arrayBuffer));
        }
      } else if (this.selectedFile && !this.isZipFile) {
        const buffer = await this.selectedFile.arrayBuffer();
        return convertToBinaryString(new Uint8Array(buffer));
      }
      throw new Error('Cannot fetch binary content without a file or firmware selected');
    },
    async connectEsp32(transport: Transport, terminal: Terminal): Promise<ESPLoader> {
      const loaderOptions = <LoaderOptions>{
        transport,
        baudrate: this.baudRate,
        enableTracing: false,
        terminal: {
          clean() {
            terminal.clear();
          },
          writeLine(data) {
            terminal.writeln(data);
          },
          write(data) {
            terminal.write(data);
          }
        }
      };
      const espLoader = new ESPLoader(loaderOptions);
      const chip = await espLoader.main();
      console.log("Detected chip:", chip);
      return espLoader;
    },
    async readSerial(port: SerialPort, terminal: Terminal): Promise<void> {
      const decoder = new TextDecoderStream();
      port.readable!.pipeTo(decoder.writable);
      const inputStream = decoder.readable;
      const reader = inputStream.getReader();

      while (true) {
        const{ value } = await reader.read();
        if (value) {
          terminal.write(value);
        }
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    },
  },
})