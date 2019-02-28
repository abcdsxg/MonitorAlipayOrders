const puppeteer = require('puppeteer');
const keyDefinitions = require('./USKeyboardLayout');
const rl = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});
var config = require('./config/config.js');

async function getAlipayOrders() {
    console.log("启动浏览器")
    const browser = await puppeteer.launch({
        headless: false, //不想显示浏览器,可以去掉这一行
        // args: [
        //     '--no-sandbox',
        //     '--disable-setuid-sandbox',
        //     '--disable-dev-shm-usage',
        // ]
    });

    const login_page = await browser.newPage()

    if (config.qrLogin) {
        await alipayQrLogin(login_page)
    } else {
        await alipayPwdLogin(login_page, config)
    }

    refreshAlipayHome(login_page)

    const order_page = await browser.newPage()

    var orders = {}

    for (; ;) {
        await watchOrder(order_page, orders)
        await delay(3000)
    }
    // browser.close();
}


async function alipayQrLogin(page) {
    var data = {}

    await gotoUrl(page, "https://auth.alipay.com/login/index.htm");

    await page.waitFor(".barcode")

    console.log("你选择了扫码二维码支付宝登录, 已保存为alipay_login_qrcode.png")
    await screenshotDOMElement(page, {
        path: 'alipay_login_qrcode.png',
        selector: '.barcode',
        padding: 5
    });

    for (; ;) {
        try {
            await page.waitFor(".userName", { timeout: 3000 })

            var welcome = await page.evaluate(() => {
                var welcome = document.querySelector('#container > div.i-banner > div.i-banner-content.fn-clear > div.i-banner-main > div.i-banner-main-hello.fn-clear > p');
                if (welcome != null) {
                    return welcome.innerText
                }
            });

            if (welcome != {}) {
                console.log(welcome)

                var cookies = await page.cookies()
                var cookieStr = ''
                cookies.forEach(c => {
                    cookieStr += c.name + '=' + c.value + '; '
                });

                data['cookie'] = cookieStr
                break
            }

        } catch (e) {
            console.log("等待支付宝扫码登录结果~")
        }
    }
    return data
}

async function alipayPwdLogin(page, config) {
    var data = {}

    await gotoUrl(page, "https://auth.alipay.com/login/index.htm");

    await page.waitFor("#J-loginMethod-tabs")

    await page.click("#J-loginMethod-tabs > li:nth-child(2)")

    await page.focus("#J-input-user")
    for (var i = 0; i < config.username.length; i++) {
        var letter = config.username.charAt(i)
        await page.keyboard.press(keyDefinitions[letter].code, { delay: 200 })
    }


    await page.focus("#password_rsainput")
    for (var i = 0; i < config.pwd.length; i++) {
        var letter = config.pwd.charAt(i)
        await page.keyboard.press(keyDefinitions[letter].code, { delay: 200 })
    }

    var need_captcha = await page.evaluate(() => {
        var code = document.querySelector('#J-checkcode');
        if (code != null && code.className.indexOf("fn-hide") == -1) {
            console.log(code)
            return true
        }
        return false
    });
    if (need_captcha) {
        console.log("需要验证码")
        await screenshotDOMElement(page, {
            path: 'alipay_login_captcha.png',
            selector: '#J-checkcode-img',
            padding: 5
        });

        const wait_aptcha = (query) => new Promise(resolve => rl.question(query, (captcha) => resolve(captcha)));
        let captcha = await wait_aptcha('请在控制台输入验证码, 图片保存在alipay_login_captcha.png \n');
        console.log(`真的是${captcha}吗QAQ……`);

        await page.focus("#J-input-checkcode")
        for (var i = 0; i < captcha.length; i++) {
            var letter = captcha.charAt(i)
            await page.keyboard.press(keyDefinitions[letter].code, { delay: 200 })
        }
    } else {
        console.log('恭喜!本次登录没有验证码~');

    }

    await page.click("#J-login-btn")

    try {
        await page.waitFor(".userName")

        var welcome = await page.evaluate(() => {
            var welcome = document.querySelector('#container > div.i-banner > div.i-banner-content.fn-clear > div.i-banner-main > div.i-banner-main-hello.fn-clear > p');
            if (welcome != null) {
                return welcome.innerText
            }
        });

        if (welcome != {}) {
            console.log(welcome)
        }
    } catch (e) {
        console.log("登录貌似没成功~", e)
    }

    return data
}

async function watchOrder(page, orders) {
    var url = "https://consumeprod.alipay.com/record/advanced.htm"
    await gotoUrl(page, url);

    await page.waitFor("#globalContainer")

    var has_risk_qrcode = await page.evaluate(() => {
        var risk_qrcode = document.querySelector('#risk_qrcode_cnt');
        if (risk_qrcode != null) {
            return true
        }
        return false
    });

    if (has_risk_qrcode) {
        console.log("此页面需要扫描二维码验证")
        await screenshotDOMElement(page, {
            path: 'alipay_risk_qrcode.png',
            selector: '#risk_qrcode_cnt',
            padding: 16
        });

    }

    for (; ;) {
        try {
            await page.waitFor(".J-item  ", { timeout: 3000 })
            var order_items = await page.evaluate(() => {
                var data = {}
                var order_items = document.querySelectorAll('.J-item  ');
                for (var i = 0; i < order_items.length; i++) {
                    var order_info = {}

                    var order_item = order_items[i]
                    var order_no = order_item.querySelector(".tradeNo")

                    if (order_no != null && order_no.innerText.indexOf("订单号:") !== -1) {
                        if (order_item.querySelector(".time") != null) {
                            order_info["time"] = order_item.querySelector(".time").innerText
                        }
                        if (order_item.querySelector(".name") != null) {
                            order_info["name"] = order_item.querySelector(".name").innerText
                        }
                        if (order_item.querySelector(".time") != null) {
                            order_info["memo"] = order_item.querySelector(".memo").innerText
                        }
                        if (order_item.querySelector(".tradeNo") != null) {
                            order_info["order"] = order_item.querySelector(".tradeNo").innerText
                        }
                        if (order_item.querySelector(".other") != null) {
                            order_info["sender"] = order_item.querySelector(".other").innerText
                        }
                        if (order_item.querySelector(".amount") != null) {
                            order_info["amount"] = order_item.querySelector(".amount").innerText
                        }
                        if (order_item.querySelector(".detail") != null) {
                            order_info["detail"] = order_item.querySelector(".detail").innerText
                        }
                        if (order_item.querySelector(".status") != null) {
                            order_info["status"] = order_item.querySelector(".status").innerText
                        }
                        data[order_no.innerText] = order_info
                    }
                }
                return data
            });

            for (var key in order_items) {
                value = order_items[key]
                if (order_items.length > 0 && !orders.hasOwnProperty(key)) {
                    console.log("新订单:", value)
                    //todo anything you want
                }
                orders[key] = value
            }
            break

        } catch (e) {
            console.log("获取订单信息出错,需要扫码验证(二维码已存为alipay_risk_qrcode.png):")
            await delay(3000)
        }
    }
    return
}

async function refreshAlipayHome(page) {
    for (; ;) {
        await delay(30 * 1000)
        await gotoUrl(page, "https://my.alipay.com/portal/i.htm?referer=https%3A%2F%2Fauth.alipay.com%2Flogin%2Findex.htm")
    }
}

async function gotoUrl(page, url) {
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "webdriver", {
            get: () => false
        });
    });
    await page.goto(url)
}

function delay(timeout) {
    return new Promise((resolve) => {
        setTimeout(resolve, timeout);
    });
}


async function screenshotDOMElement(page, opts = {}) {
    const padding = 'padding' in opts ? opts.padding : 0;
    const path = 'path' in opts ? opts.path : null;
    const selector = opts.selector;

    if (!selector)
        throw Error('Please provide a selector.');

    const rect = await page.evaluate(selector => {
        const element = document.querySelector(selector);
        if (!element)
            return null;
        const { x, y, width, height } = element.getBoundingClientRect();
        return { left: x, top: y, width, height, id: element.id };
    }, selector);

    if (!rect)
        throw Error(`Could not find element that matches selector: ${selector}.`);

    return await page.screenshot({
        path,
        clip: {
            x: rect.left - padding,
            y: rect.top - padding,
            width: rect.width + padding * 2,
            height: rect.height + padding * 2
        }
    });
}

getAlipayOrders()
