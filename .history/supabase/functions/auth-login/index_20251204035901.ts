// Setup type definitions for built-in Supabase Runtime APIs
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

console.log("Auth-Login Function Started (Spam Protection Mode)");

// --- CẤU HÌNH GIỚI HẠN ---
// Cho phép gọi API đăng nhập tối đa 10 lần từ 1 IP trong vòng 5 phút
// Bất kể đăng nhập đúng hay sai, cứ gọi quá 10 lần là chặn.
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

    // 1. Lấy IP
    const clientIP = req.headers.get("x-forwarded-for")?.split(',')[0].trim() || 'unknown';
    
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // --- LOGIC CHẶN SPAM (SỬA ĐỔI Ở ĐÂY) ---
    
    const timeLimit = new Date();
    timeLimit.setMinutes(timeLimit.getMinutes() - WINDOW_MINUTES);

    // Đếm TỔNG SỐ LẦN IP này đã gọi vào đây trong 5 phút qua
    // (Lưu ý: Tôi đã BỎ dòng .eq('success', false) đi rồi)
    const { count, error: dbError } = await supabaseAdmin
      .from('login_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('ip_address', clientIP)
      .gte('attempt_time', timeLimit.toISOString());

    if (!dbError && count !== null) {
      // Nếu tổng số lần gọi >= giới hạn -> CHẶN
      if (count >= MAX_REQUESTS) {
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

    // Hàm ghi log: Ghi lại MỌI request vào DB để đếm cho lần sau
    const logAttempt = async (isSuccess: boolean) => {
       await supabaseAdmin.from('login_attempts').insert({
         ip_address: clientIP,
         success: isSuccess
       });
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
      await logAttempt(false); // Ghi nhận 1 lần gọi (thất bại)
      return new Response(
        JSON.stringify({ message: 'Xác minh Robot thất bại.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. Check Đăng nhập
    const { data, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      await logAttempt(false); // Ghi nhận 1 lần gọi (thất bại)
      return new Response(
        JSON.stringify({ message: 'Thông tin đăng nhập không đúng.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Thành công
    await logAttempt(true); // Ghi nhận 1 lần gọi (thành công)
    
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