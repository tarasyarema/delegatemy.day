import './index.css';

const startButton = document.getElementById('startButton')
const stopButton = document.getElementById('stopButton')
const loading = document.getElementById('loading')

window.electronAPI.on('test', (_, data: any) => {
  console.log('[rend] test', { data });

  if (!data) {
    return;
  }

  if (data.action === "transcription") {
    const info = document.getElementById('info');

    if (!info.innerText) {
      info.innerText = "";
    }

    info.innerText += data.data;
  } else if (data.action === "recording") {
    loading.style.display = 'block';

    startButton.setAttribute('disabled', 'true');
    stopButton.removeAttribute('disabled');

    const info = document.getElementById('info');
    info.innerText = "";

    const div = document.getElementById('output');

    // Clean childs
    div.innerHTML = "";

    const preEle = document.createElement('pre');
    preEle.innerText = "Recording...";

    div.appendChild(preEle);
  } else if (data.action === "recording-done") {
    loading.style.display = 'none';

    startButton.removeAttribute('disabled');
    stopButton.setAttribute('disabled', 'true');

    const preEle = document.createElement('pre');

    preEle.innerText = "Recording done";

    const div = document.getElementById('output');
    div.appendChild(preEle);
  }
});

startButton.addEventListener('click', () => {
  window.electronAPI.invoke('test', { source: "renderer", event: 'start' }).then(() => {
    console.log('[renderer] start');
  });
})

stopButton.addEventListener('click', () => {
  window.electronAPI.invoke('test', { source: "renderer", event: 'stop' }).then(() => {
    console.log('[renderer] stop');
  });
})

