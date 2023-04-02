const https = require('https');
const readline = require('readline');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const os = require('os');

//国内，使用API2D代理的api
const apiKey = '填写你的Forward Key'
const HostName = 'openai.api2d.net'

//国外，直接使用ChatGPT官方api
// const apiKey = '填写你的api key'
// const HostName = 'api.openai.com'

var Platform = os.platform()

//初始化一个对话列表数据，用于每次发给ChatGPT联系上下文
var Messages = [{
  role: 'user',
  content: `
  1.我需要你充当我的终端命令行查询手册，我的设备平台是：${Platform}。
  2.当我告诉你一个任务时，你需要告诉我对应的终端命令的什么，并且永远按照 RUN("your_command") 的格式来表示要在终端执行的命令。
  3."your_command"字符串的形式要严格符合Node.js中child_process模块的exec方法的参数形式。
  4.我会使用 STDOUT:message 的格式告诉你命令执行的正常输出结果，使用 STDERR:message 的格式告诉你命令执行的错误输出结果。
  5.你在得到输出结果后，要么帮我解读一下，要么告诉我正确的命令，要么告诉我下一步命令
  6.如果你理解了以上内容，我们来做个测试吧：列出当前目录下的文件。`
}]

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function logMessage(msg){
  if(msg.role == "user"){
    console.log('\x1b[34m%s\x1b[0m', `You: ${msg.content}`)//蓝色输出
  }else if(msg.role == "assistant"){
    console.log('\x1b[36m%s\x1b[0m', `ChatGPT: ${msg.content}`)//青色
  }else if(msg.role == "system"){
    console.log('\x1b[33m%s\x1b[0m', `System: ${msg.content}`)//黄色
  }
}

function sendMessage() {
  logMessage(Messages[Messages.length-1])
  return new Promise((resolve, reject) => {
    var options = {
      hostname: HostName,
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey, //
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        const response = JSON.parse(data);
        if (response.choices && response.choices.length > 0) {
          resolve(response.choices[0].message);
        } else {
          reject('No response from OpenAI API');
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(JSON.stringify({
      model: 'gpt-3.5-turbo',
      temperature: 0.2,
      max_tokens: 2048,
      messages: Messages,
    }));
    req.end();
  });
}

function getUserInput() {
  return new Promise((resolve) => {
    rl.question('You: ', (answer) => {
      resolve(answer);
    });
  });
}

async function runCommand(command) {
  try {
    const { stdout, stderr } = await exec(command);
    return { stdout, stderr };
  } catch (error) {
    return { stdout: '', stderr: error.message };
  }
}

async function waitUserInput(){
  console.log('等待用户输入...');
  input = await getUserInput();
  Messages.push({
    role: 'user',
    content: input
  })
}

async function main() {
  let input;
  let output;
  while (true) {
    output = await sendMessage();
    Messages.push(output)
    logMessage(Messages[Messages.length-1])
    //检查output中的RUN指令
    var s = output.content.indexOf('RUN(')
    if (s !== -1) {
      var e = output.content.indexOf(')')
      var cmd = output.content.substring(s + 5, e - 1)//RUN()指令括号内的内容
      if(cmd.length > 0){
        console.log('\x1b[33m%s\x1b[0m', '执行命令中...');
        const { stdout, stderr } = await runCommand(cmd);
        Messages.push({
          role: 'user',
          content: `命令 ${cmd} 执行完毕
          STDOUT:${stdout}
          STDERR:${stderr}`
        })
      }else{
        await waitUserInput()
      }
    } else {
      await waitUserInput()
    }
  }
}

main();

