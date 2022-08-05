import emails from '../models/emails.js'
import normalizeEmail from '../util/normalizeEmail.js'
import sendMailGo from '../util/sendMail.js'

export const sendMail = (mode) => {
  return async (req, res) => {
    try {
      const formatedEmail = normalizeEmail(req.body.email)
      const email = await emails.findOne({ email: formatedEmail })
      // 6位驗證碼
      const createCode = Math.floor(Math.random() * 1000000).toString().padStart(6, "0")
      if (email) {
        //已經註冊過，就不可用
        if (email.occupied) {
          res.status(403).send({ success: false, message: { title: '該信箱已經註冊', text: formatedEmail } })
          return
        }
        email.code = createCode
        email.date = Date.now()
        email.times = 1
        email.isSchool = req.body.isSchool
        console.log(createCode);
        await sendMailGo(formatedEmail, createCode)
        await email.save()
      } else {
        console.log(createCode);
        await sendMailGo(formatedEmail, '課程網註冊驗證碼',
          `$(createCode)  是你的信箱驗證碼，一天內有效<br> 請至原頁面填入驗證，進入下步驟`
        )
        await emails.create({ isSchool: req.body.isSchool, email: formatedEmail, code: createCode, date: Date.now(), occupied: false })
      }
      res.status(200).send({ success: true, message: { title: '信箱已寄送', text: formatedEmail } })
    } catch (error) {
      res.status(500).send({ success: false, message: '伺服器錯誤' })
    }
  }
}

export const verifyMail = (isMiddle) => {
  return async (req, res, next) => {
    try {
      const mail = req.body.schoolEmail ? req.body.schoolEmail : req.body.email
      const code = req.body.schoolEmailCode ? req.body.schoolEmailCode : req.body.emailCode
      if (!(code?.length === 6 && code.match(/^[0-9]+$/))) { return res.status(403).send({ success: false, message: { title: '驗證碼應為六位數字', duration: 3 } }) }
      const formatedEmail = normalizeEmail(mail)
      const email = await emails.findOne({ email: formatedEmail })
      // 防亂驗證信箱
      if (email && email?.occupied) {
        res.status(403).send({ success: false, message: { title: '該信箱已註冊', text: formatedEmail, duration: 3 } })
      } else if (!email) {
        res.status(403).send({ success: false, message: { title: '請寄送驗證信驗證', duration: 3 } })
      } else if (email.date.getTime() + 1000 * 60 * 60 * 24 < Date.now()) {
        res.status(403).send({ success: false, message: { title: '驗證碼超過一天,請重寄驗證信驗證', duration: 3 } })
      } else if (email.times > 3) {
        res.status(403).send({ success: false, message: { title: '錯誤過多次，請重寄驗證信驗證', duration: 3 } })
      } else if (email.code != code) {
        email.times++
        await email.save()
        res.status(403).send({ success: false, message: { title: '驗證碼錯誤,超過3次須重寄驗證信', duration: 3 } })
      } else if (isMiddle) {
        req.mail = email
        next()
      } else { res.status(200).send({ success: true, message: { title: '驗證成功', text: formatedEmail + '請進行下步驟', duration: 2 } }) }
    } catch (error) {
      console.log(error);
      res.status(500).send({ success: false, message: '伺服器錯誤' })
    }
  }
}


export const sendPWDMail = async (req, res) => {
  try {
    const formatedEmail = normalizeEmail(req.body.email)
    const email = await emails.findOne({ email: formatedEmail })
    // 8位驗證碼
    //未註冊，就不可用
    if (!email || !email.occupied) {
      res.status(403).send({ success: false, message: { title: '該信箱尚未註冊', text: formatedEmail } })
      return
    }
    const createCode = Math.floor(Math.random() * 100000000).toString().padStart(8, "0")
    email.code = createCode
    email.date = Date.now()
    email.times = 1
    console.log(createCode);
    await sendMailGo(formatedEmail, '課程網找回密碼',
      `$(createCode)  8位數字是你的臨時驗證碼，一天內有效 <br> 請至原頁面填入驗證，進入下步驟`
    )
    await email.save()
    res.status(200).send({ success: true, message: { title: '已寄送找回密碼驗證碼', text: formatedEmail } })
  } catch (error) {
    res.status(500).send({ success: false, message: '伺服器錯誤' })
  }
}


export const verifyPWDMail = async (req, res, next) => {
  try {
    if (!(req.body.code?.length === 8 && req.body.code.match(/^[0-9]+$/))) { return res.status(403).send({ success: false, message: { title: '驗證碼應為八位數字', duration: 3 } }) }
    const formatedEmail = normalizeEmail(req.body.email)
    const email = await emails.findOne({ email: formatedEmail })
    if (!email || !email.occupied) {
      res.status(403).send({ success: false, message: { title: '尚未申請忘記密碼', text: formatedEmail } })
      return
    } else if (email.date.getTime() + 1000 * 60 * 60 * 1 < Date.now()) {
      res.status(403).send({ success: false, message: { title: '驗證碼超過一小時,請重寄驗證信驗證', duration: 3 } })
    } else if (email.times > 3) {
      res.status(403).send({ success: false, message: { title: '錯誤過多次，請重寄驗證信驗證', duration: 3 } })
    } else if (email.code != req.body.code) {
      email.times++
      await email.save()
      res.status(403).send({ success: false, message: { title: '驗證碼錯誤,超過3次須重寄驗證信', duration: 3 } })
    } else {
      req.mail = email
      next()
    }
  } catch (error) {
    console.log(error);
    res.status(500).send({ success: false, message: '伺服器錯誤' })
  }
}

