import querystring from 'querystring';

import { remote, ipcRenderer } from 'electron';
import { t } from 'i18next';

const { app, dialog } = remote;

const setupUpdateDialog = () => {
	const { newVersion } = querystring.parse(window.location.search.slice(1));
	const currentVersion = app.getVersion();

	let prevEmptyDeps;
	let installButton;

	const root = document.querySelector('.update-page');

	const render = () => {
		// useEffect
		document.title = t('dialog.update.title');

		// useRef
		installButton = root.querySelector('.update-install-action');

		// useEffect deps=[]
		if (!prevEmptyDeps) {
			prevEmptyDeps = [];
			installButton.focus();
		}

		const handleSkipButtonClick = async () => {
			await dialog.showMessageBox(remote.getCurrentWindow(), {
				type: 'warning',
				title: t('dialog.updateSkip.title'),
				message: t('dialog.updateSkip.message'),
				buttons: [t('dialog.updateSkip.ok')],
				defaultId: 0,
			});
			ipcRenderer.send('skip-update-version', newVersion);
			ipcRenderer.send('close-update-dialog');
		};

		const handleRemindLaterButtonClick = () => {
			ipcRenderer.send('remind-update-later');
			ipcRenderer.send('close-update-dialog');
		};

		const handleInstallButtonClick = async () => {
			await dialog.showMessageBox(remote.getCurrentWindow(), {
				type: 'info',
				title: t('dialog.updateDownloading.title'),
				message: t('dialog.updateDownloading.message'),
				buttons: [t('dialog.updateDownloading.ok')],
				defaultId: 0,
			});
			ipcRenderer.send('download-update');
			ipcRenderer.send('close-update-dialog');
		};

		root.querySelector('.update-title').innerText = t('dialog.update.announcement');

		root.querySelector('.update-message').innerText = t('dialog.update.message');

		root.querySelector('.current-version .app-version-label').innerText = t('dialog.update.currentVersion');

		root.querySelector('.current-version .app-version-value').innerText = currentVersion;

		root.querySelector('.new-version .app-version-label').innerText = t('dialog.update.newVersion');

		root.querySelector('.new-version .app-version-value').innerText = newVersion;

		root.querySelector('.update-skip-action').innerText = t('dialog.update.skip');
		root.querySelector('.update-skip-action').onclick = handleSkipButtonClick;

		root.querySelector('.update-remind-action').innerText = t('dialog.update.remindLater');
		root.querySelector('.update-remind-action').onclick = handleRemindLaterButtonClick;

		root.querySelector('.update-install-action').innerText = t('dialog.update.install');
		root.querySelector('.update-install-action').onclick = handleInstallButtonClick;
	};

	render();
};

export default setupUpdateDialog;
