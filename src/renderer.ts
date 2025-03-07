import './index.css';

const startButton = document.getElementById('startButton')
const runButton = document.getElementById('runButton')
const task = document.getElementById('task')

const loading = document.getElementById('loading')

window.electronAPI.on('test', (_, data: any) => {
  console.log('[rend] test', { data });

  if (!data) {
    return;
  }

  if (data.action === "transcription") {
    const output = document.getElementById('output');

    const {
      data: {
        id,
        role,
        date,
        type,
        data: deltaData
      }
    } = data;

    // Try get element inside output by `id`

    const maybePrev = document.getElementById(id);

    if (maybePrev) {
      if (type === "text") {
        maybePrev.innerText += deltaData;
      } else if (type === "tool-call") {
        maybePrev.innerText += deltaData;
      }
    } else {
      const newEle = document.createElement('div');

      newEle.ariaRoleDescription = "alert";

      switch (role) {
        case 'user':
          newEle.className = "alert alert-light";
          break;
        case 'system':
          newEle.className = "alert alert-info";
          break;
      }

      newEle.id = id;

      if (type === "text") {
        newEle.innerText = `${new Date(date).toLocaleTimeString()}: ${deltaData}`;
      }

      output.prepend(newEle);
    }
  } else if (data.action === "recording") {
    loading.style.display = 'block';

    startButton.setAttribute('disabled', 'true');

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

    const preEle = document.createElement('pre');

    preEle.innerText = "Recording done";

    const div = document.getElementById('output');
    div.appendChild(preEle);
  }
});

startButton.addEventListener('click', () => {
  window.electronAPI.invoke('test', { source: "renderer", event: 'start' }).then(() => {
    console.log('[renderer] start recording');
  });
})

task.addEventListener('change', () => {
  const data = (document.getElementById('task') as any).value;

  console.log({ data });

  if (!data || !data.length) {
    runButton.setAttribute('disabled', 'true');
    return;
  }

  runButton.removeAttribute('disabled');
});

runButton.addEventListener('click', () => {
  const data = (document.getElementById('task') as any).value;

  if (!data) {
    return;
  }

  window.electronAPI.invoke('test', { source: "renderer", event: 'start-text', data }).then(() => {
    console.log(`[renderer] run with task: "${data}"`);
  });
})
