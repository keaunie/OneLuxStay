function ctaClicked(e){
  e.currentTarget.classList.add('clicked');
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Opening...';
  setTimeout(()=>{
    btn.textContent = 'Book A Demo ›';
    btn.disabled = false;
    showToast('Thanks — someone will reach out!');
  },1100);
}

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 3000);
}

document.getElementById('joinBtn').addEventListener('click', ()=>{
  const email = document.getElementById('email').value.trim();
  if(!email || !email.includes('@')){ showToast('Please enter a valid email'); return; }
  showToast('Subscribed — Thanks!');
  document.getElementById('email').value='';
});

function scrollToSignup(){
  document.getElementById('email').focus();
  showToast('Enter your email to join');
}
