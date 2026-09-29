import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const root=new URL('../../../', import.meta.url);
const base=new URL('../dist/browser/', import.meta.url);
const require=createRequire(new URL('package.json', root));
const {chromium}=require('playwright');
const {collectFn}=await import(new URL('collect-fn.js', base).href);
const {recheckProduct}=await import(new URL('product-verification.js', base).href);
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.setContent('<main><div class="price"><span>₹</span><span>9</span><span>9</span><span>9</span></div><button>Purchase</button></main>');
 let d=await page.evaluate(collectFn);assert.equal(d.ecommerce.priceVisible,true);assert.equal(d.ecommerce.addToCartText,'Purchase');
 await page.setContent('<main><h1>Product</h1><div style="height:1200px"></div><div id="details"></div><div style="height:1200px"></div></main>');
 await page.evaluate(()=>addEventListener('scroll',()=>{document.querySelector('#details').innerHTML='<span class="price">$34.95</span><button>Add to cart</button>';},{once:true}));
 d=await page.evaluate(collectFn);assert.equal(d.ecommerce.priceVisible,false);
 const verified=await recheckProduct(page,d,new AbortController().signal);
 assert.equal(verified.price,'observed');assert.equal(verified.buy,'observed');assert.equal(verified.scrolled,true);assert.equal(d.ecommerce.priceAboveFold,false);assert.equal(d.ecommerce.addToCartAboveFold,false);assert.equal(await page.evaluate(()=>scrollY),0);
 console.log(JSON.stringify({result:'PASS nested price, Purchase label, scroll-triggered details, preserved arrival flags, restored scroll',verification:verified}));
}finally{await browser.close();}
