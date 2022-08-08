import mongoose from 'mongoose'
import rate from './rate.js'

const col = {
  type: [{
    // 先不用，因為用code是方便多語言/換名稱，但用i18n也能辦到
    // c: { type: Number, required: true, alias: 'code' },
    n: { type: String, required: true, alias: 'name' },
    r: { type: String, required: true, alias: 'required' },
    // 代碼表示: 1單行文字 2多行文字 3數字 4範圍 5單選 6多選 0Boolean  
    t: { type: Number, required: true, alias: 'type' }
  }], default: undefined, _id: false,
}
const datas = {
  // 對應欄位+附值(任意格式，程式處理成可用)
  type: [{
    n: { type: String, required: true, alias: 'name' },
    d: { type: [mongoose.Mixed], alias: 'data' },
  }], default: undefined, _id: false
}

const display = (type) => {
  const rule = {
    special: mongoose.Mixed,
  }
  // 抓取母版區域不重複的代號
  if (type === "article") {
    rule.filter = { type: [String], default: undefined }
    rule.sort = rule.filter
  } else {
    rule.filter = {
      dataCol: { type: [String], default: undefined },
      uniqueCol: { type: [String], default: undefined }
    }
    rule.sort = rule.filter
  }
  return rule
}

const article = new mongoose.Schema({
  n: { type: String, required: true, alias: 'name' },
  intro: { type: String, required: true },
  titleCol: { type: String, required: true },
  tagActive: Boolean,
  //如果有勾tag再填
  tagOption: { type: [String], required: function () { return this.tagActive }, default: undefined },
  contentCol: { type: String, required: true },
  col: col,
  // 程式抓版不重複供選擇,填上代表必填
})


const schema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, '必填版名'],
    minlength: [3, '必須 3 個字以上'],
    maxlength: [20, '必須 20 個字以下'],
  },
  intro: {
    type: String,
    required: [true, '必填內容'],
    minlength: [5, '必須 5 個字以上'],
    maxlength: [1000, '必須 1000 個字以下'],
  },
  parent: {
    type: mongoose.ObjectId,
    ref: 'boards'
  },
  related: {
    type: [{ type: mongoose.ObjectId, ref: 'boards' }],
    default: undefined,
  },
  // 抓取母板規則:(不一定有)
  beScored: rate('articles'),
  // 抓取母板規則:使用者要填對應的內容，就像填表單
  colData: datas,
  uniqueData: datas,
  // ---------------------------------------------------------------
  childBoard: {
    active: { type: Boolean, required: true },
    titleCol: { type: String, required: function () { return this.childBoard.active } },
    rule: {
      dataCol: col,
      // 程式抓母版不重複供選擇,填上代表必填
      uniqueCol: col,// 對應欄位+附值(任意格式，程式處理成可用)
      display: display('board'),
    },
    // 子版的文章規則
    article: {
      active: { type: Boolean, required: function () { return this.childBoard.active } },
      // 是否要評價區
      hasReview: { type: Boolean, required: function () { return this.childBoard.article.active } },
      // 大分類(評價版不用自己打，上面會判斷自動生成1評價代碼)
      // 版見越多 要管的規則越多
      category: {
        type: [article],
        default: undefined, _id: false
      },
      display: display("article"),
    }
  }
}, { versionKey: false, timestamps: { createdAt: 'created_at', updatedAt: false } })

export default mongoose.model('boards', schema)
