import { ipcRenderer, remote } from 'electron';
import jetpack from 'fs-jetpack';
import { t } from 'i18next';

const { app, dialog } = remote;
const { autoUpdater } = remote.require('electron-updater');

const updateSettingsFileName = 'update.json';
let appDir;
let userDataDir;
let appUpdateSettings;
let userUpdateSettings;
let updateSettings;

const loadUpdateSettings = (dir) => {
	try {
		return dir.read(updateSettingsFileName, 'json') || {};
	} catch (error) {
		console.error(error);
		return {};
	}
};

const saveUpdateSettings = () => {
	if (appUpdateSettings.forced) {
		return;
	}

	userDataDir.write(updateSettingsFileName, userUpdateSettings, { atomic: true });
};

const canUpdate = () => updateSettings.canUpdate
	&& (
		(process.platform === 'linux' && Boolean(process.env.APPIMAGE))
		|| (process.platform === 'win32' && !process.windowsStore)
		|| (process.platform === 'darwin' && !process.mas)
	);

const canAutoUpdate = () => updateSettings.autoUpdate !== false;

const canSetAutoUpdate = () => !appUpdateSettings.forced || appUpdateSettings.autoUpdate !== false;

const setAutoUpdate = (canAutoUpdate) => {
	if (!canSetAutoUpdate()) {
		return;
	}

	userUpdateSettings.autoUpdate = !!canAutoUpdate;
	updateSettings.autoUpdate = !!canAutoUpdate;
	saveUpdateSettings();
};

const skipUpdateVersion = (version) => {
	userUpdateSettings.skip = version;
	saveUpdateSettings();
};

const downloadUpdate = async () => {
	try {
		await autoUpdater.downloadUpdate();
	} catch (e) {
		autoUpdater.emit('error', e);
	}
};

let checkForUpdatesEvent = null;

const checkForUpdates = async (event = null, { forced = false } = {}) => {
	if (checkForUpdatesEvent) {
		return;
	}

	if ((forced || canAutoUpdate()) && canUpdate()) {
		checkForUpdatesEvent = event;
		try {
			await autoUpdater.checkForUpdates();
		} catch (e) {
			autoUpdater.emit('error', e);
		}
	}
};

const sendToMainWindow = (channel, ...args) => {
	const mainWindow = remote.getCurrentWindow();
	const send = () => mainWindow.send(channel, ...args);

	if (mainWindow.webContents.isLoading()) {
		mainWindow.webContents.on('dom-ready', send);
		return;
	}

	send();
};

const handleCheckingForUpdate = () => {
	sendToMainWindow('update-checking');
};

const handleUpdateAvailable = ({ version }) => {
	if (checkForUpdatesEvent) {
		checkForUpdatesEvent.sender.send('update-result', true);
		checkForUpdatesEvent = null;
	} else if (updateSettings.skip === version) {
		return;
	}

	ipcRenderer.send('close-about-dialog');
	ipcRenderer.send('open-update-dialog', { newVersion: version });
};

const handleUpdateNotAvailable = () => {
	sendToMainWindow('update-not-available');

	if (checkForUpdatesEvent) {
		checkForUpdatesEvent.sender.send('update-result', false);
		checkForUpdatesEvent = null;
	}
};

const handleUpdateDownloaded = async () => {
	const mainWindow = remote.getCurrentWindow();

	const { response } = await dialog.showMessageBox(mainWindow, {
		type: 'question',
		title: t('dialog.updateReady.title'),
		message: t('dialog.updateReady.message'),
		buttons: [
			t('dialog.updateReady.installLater'),
			t('dialog.updateReady.installNow'),
		],
		defaultId: 1,
	});

	if (response === 0) {
		await dialog.showMessageBox(mainWindow, {
			type: 'info',
			title: t('dialog.updateInstallLater.title'),
			message: t('dialog.updateInstallLater.message'),
			buttons: [t('dialog.updateInstallLater.ok')],
			defaultId: 0,
		});
		return;
	}

	mainWindow.removeAllListeners();
	app.removeAllListeners('window-all-closed');
	try {
		autoUpdater.quitAndInstall();
	} catch (e) {
		autoUpdater.emit('error', e);
	}
};

const handleError = async (error) => {
	sendToMainWindow('update-error', error);

	if (checkForUpdatesEvent) {
		checkForUpdatesEvent.sender.send('update-result', false);
		checkForUpdatesEvent = null;
	}
};

export const setupUpdates = async () => {
	appDir = jetpack.cwd(app.getAppPath(), app.getAppPath().endsWith('app.asar') ? '..' : '.');
	userDataDir = jetpack.cwd(app.getPath('userData'));
	appUpdateSettings = loadUpdateSettings(appDir);
	userUpdateSettings = loadUpdateSettings(userDataDir);
	updateSettings = (() => {
		const defaultUpdateSettings = { autoUpdate: true, canUpdate: true };

		if (appUpdateSettings.forced) {
			return Object.assign({}, defaultUpdateSettings, appUpdateSettings);
		}
		return Object.assign({}, defaultUpdateSettings, appUpdateSettings, userUpdateSettings);
	})();
	delete updateSettings.forced;

	autoUpdater.autoDownload = false;
	autoUpdater.on('checking-for-update', handleCheckingForUpdate);
	autoUpdater.on('update-available', handleUpdateAvailable);
	autoUpdater.on('update-not-available', handleUpdateNotAvailable);
	autoUpdater.on('update-downloaded', handleUpdateDownloaded);
	autoUpdater.on('error', handleError);

	window.addEventListener('unload', () => {
		autoUpdater.off('checking-for-update', handleCheckingForUpdate);
		autoUpdater.off('update-available', handleUpdateAvailable);
		autoUpdater.off('update-not-available', handleUpdateNotAvailable);
		autoUpdater.off('update-downloaded', handleUpdateDownloaded);
		autoUpdater.off('error', handleError);
	});

	remote.ipcMain.handle('can-update', () => canUpdate());
	remote.ipcMain.handle('can-auto-update', () => canAutoUpdate());
	remote.ipcMain.handle('can-set-auto-update', () => canSetAutoUpdate());
	remote.ipcMain.on('set-auto-update', (_, canAutoUpdate) => setAutoUpdate(canAutoUpdate));
	remote.ipcMain.on('check-for-updates', (event, ...args) => checkForUpdates(event, ...args));
	remote.ipcMain.on('skip-update-version', (_, ...args) => skipUpdateVersion(...args));
	remote.ipcMain.on('remind-update-later', () => {});
	remote.ipcMain.on('download-update', () => downloadUpdate());

	window.addEventListener('unload', () => {
		remote.ipcMain.removeHandler('can-update');
		remote.ipcMain.removeHandler('can-auto-update');
		remote.ipcMain.removeHandler('can-set-auto-update');
		remote.ipcMain.removeAllListeners('set-auto-update');
		remote.ipcMain.removeAllListeners('check-for-updates');
		remote.ipcMain.removeAllListeners('skip-update-version');
		remote.ipcMain.removeAllListeners('remind-update-later');
		remote.ipcMain.removeAllListeners('download-update');
	});

	checkForUpdates();
};
