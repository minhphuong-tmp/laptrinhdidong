// Setup type definitions for built-in Supabase Runtime APIs
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

console.log("Auth-Login Function Started (Debug Mode)");

const MAX_REQUESTS = 5;       
const WINDOW_MINUTES = 5;     

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const RECAPTCHA_SECRET = Deno.env.get('GOOGLE_RECAPTCHA_SECRET');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!RECAPTCHA_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error("Thiếu biến môi trường.");
    }

    // 1. Lấy IP (Thêm log để kiểm tra)
    const clientIP = req.headers.get("x-forwarded-for")?.split(',')[0].trim() || 'unknown';
    console.log(`[DEBUG] Client IP detected: ${clientIP}`);
    
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // --- LOGIC CHẶN SPAM ---
    const timeLimit = new Date();
    timeLimit.setMinutes(timeLimit.getMinutes() - WINDOW_MINUTES);

    const { count, error: dbError } = await supabaseAdmin
      .from('login_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('ip_address', clientIP)
      .gte('attempt_time', timeLimit.toISOString());

    // [QUAN TRỌNG] In ra lỗi nếu có
    if (dbError) {
      console.error("[ERROR] Lỗi truy vấn Database:", dbError);
    } else {
      console.log(`[DEBUG] Số lần thử từ IP ${clientIP} trong ${WINDOW_MINUTES} phút qua: ${count}`);
    }

    if (!dbError && count !== null) {
      if (count >= MAX_REQUESTS) {
        console.log(`[BLOCK] IP ${clientIP} đã bị chặn.`);
        return new Response(
          JSON.stringify({ 
            message: `Bạn thao tác quá nhanh! Vui lòng thử lại sau ${WINDOW_MINUTES} phút.` 
          }),
          { status: 429, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
    // --- HẾT PHẦN CHECK ---

    const { email, password, recaptchaToken } = await req.json();

    // Hàm ghi log
    const logAttempt = async (isSuccess: boolean) => {
       const { error: insertError } = await supabaseAdmin.from('login_attempts').insert({
         ip_address: clientIP,
         success: isSuccess
       });
       if (insertError) console.error("[ERROR] Không thể ghi log:", insertError);
       else console.log("[DEBUG] Đã ghi log thành công.");
    };

    // 2. Check reCAPTCHA
    const verifyRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: RECAPTCHA_SECRET,
        response: recaptchaToken,
      }),
    });
    const verifyData = await verifyRes.json();

    if (!verifyData.success) {
      console.log("[FAIL] reCAPTCHA sai.");
      await logAttempt(false); 
      return new Response(
        JSON.stringify({ message: 'Đăng nhập sai.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. Check Đăng nhập
    const { data, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      console.log("[FAIL] Sai mật khẩu/email.");
      await logAttempt(false);
      return new Response(
        JSON.stringify({ message: 'Thông tin đăng nhập không đúng.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Thành công
    console.log("[SUCCESS] Đăng nhập thành công.");
    await logAttempt(true);
    
    return new Response(
      JSON.stringify({ 
        message: 'Đăng nhập thành công',
        session: data.session,
        user: data.user 
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ message: 'Lỗi server.' }), { status: 500 });
  }
});